'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useSocketContext } from './SocketProvider';

const TEAM_ID = 'acme-eng';

interface TimelineEvent {
  id: string;
  source: 'github' | 'sentry' | 'uptime';
  event_type: string;
  title: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  occurred_at: string;
}

interface TimelineIncident {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  created_at: string;
  resolved_at: string | null;
}

interface Annotation {
  id: string;
  team_id: string;
  user_id: string;
  content: string;
  timestamp_target: string;
  created_at: string;
}

type TimeRange = '6h' | '24h' | '7d' | '30d';

const SOURCE_COLORS: Record<string, string> = {
  github: '#6c5ce7',
  sentry: '#ff6b6b',
  uptime: '#00e5a0',
};

const SEVERITY_COLORS: Record<string, string> = {
  info: '#60a5fa',
  warning: '#ffd93d',
  error: '#ff6b6b',
  critical: '#ef4444',
};

const INCIDENT_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#fbbf24',
  low: '#6b7280',
};

const RANGE_HOURS: Record<TimeRange, number> = {
  '6h': 6,
  '24h': 24,
  '7d': 168,
  '30d': 720,
};

export default function TimelineChart() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [incidents, setIncidents] = useState<TimelineIncident[]>([]);
  const [range, setRange] = useState<TimeRange>('24h');
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const currentTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const [brushMode, setBrushMode] = useState(false);
  const brushModeRef = useRef(false);
  const [annotateMode, setAnnotateMode] = useState(false);
  const annotateModeRef = useRef(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotateModal, setAnnotateModal] = useState<{ timestamp: Date; x: number; y: number } | null>(null);
  const [annotateText, setAnnotateText] = useState('');

  // ─── USE REACTIVE STATE from context (NOT on/off) ───
  const { lastEvent, metricsVersion, lastAnnotation, sendTimelineCursor, timelineCursors } = useSocketContext();
  const xScaleRef = useRef<d3.ScaleTime<number, number> | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const hours = RANGE_HOURS[range];
      const from = new Date(Date.now() - hours * 3600000).toISOString();

      const [eventsRes, incidentsRes, annotationsRes] = await Promise.all([
        fetch(`/api/teams/${TEAM_ID}/events?limit=500&from=${from}`),
        fetch(`/api/teams/${TEAM_ID}/incidents`),
        fetch(`/api/teams/${TEAM_ID}/annotations?from=${from}`),
      ]);

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events || []);
      }
      if (incidentsRes.ok) {
        const data = await incidentsRes.json();
        setIncidents(data || []);
      }
      if (annotationsRes.ok) {
        const data = await annotationsRes.json();
        setAnnotations(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch timeline data:', err);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // ─── React to live events via context state ───
  useEffect(() => {
    if (!lastEvent) return;
    const normalized: TimelineEvent = {
      id: lastEvent.id,
      source: lastEvent.source as TimelineEvent['source'],
      event_type: lastEvent.eventType,
      title: lastEvent.title,
      severity: lastEvent.severity as TimelineEvent['severity'],
      occurred_at: lastEvent.occurredAt,
    };
    setEvents((prev) => [normalized, ...prev]);
  }, [lastEvent]);

  // ─── React to metrics updates via context state ───
  useEffect(() => {
    if (metricsVersion > 0) {
      fetchData();
    }
  }, [metricsVersion, fetchData]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Keep brushModeRef in sync with state (so D3 callbacks see current value)
  useEffect(() => {
    brushModeRef.current = brushMode;
  }, [brushMode]);

  // Keep annotateModeRef in sync
  useEffect(() => {
    annotateModeRef.current = annotateMode;
  }, [annotateMode]);

  // React to real-time annotations from other users
  useEffect(() => {
    if (!lastAnnotation) return;
    setAnnotations((prev) => {
      if (prev.some((a) => a.id === lastAnnotation.id)) return prev;
      return [...prev, lastAnnotation];
    });
  }, [lastAnnotation]);

  // D3 render
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || loading) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 30, right: 20, bottom: 40, left: 20 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const hours = RANGE_HOURS[range];
    const now = new Date();
    const start = new Date(now.getTime() - hours * 3600000);

    // Scales
    const xScale = d3.scaleTime().domain([start, now]).range([0, width]);
    xScaleRef.current = xScale;

    // Source lanes (y positions)
    const sources = ['github', 'sentry', 'uptime'] as const;
    const laneHeight = (height - 50) / 3;
    const yLane = (source: string) => {
      const idx = sources.indexOf(source as any);
      return idx >= 0 ? margin.top + idx * laneHeight + laneHeight / 2 : margin.top + height / 2;
    };

    // Main group
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},0)`);

    // Clip path
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'timeline-clip')
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height + margin.top + margin.bottom);

    const chartArea = g.append('g').attr('clip-path', 'url(#timeline-clip)');

    // --- Lane backgrounds & labels ---
    sources.forEach((source, i) => {
      const y = margin.top + i * laneHeight;

      chartArea.append('rect')
        .attr('x', 0)
        .attr('y', y)
        .attr('width', width)
        .attr('height', laneHeight)
        .attr('fill', i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.025)')
        .attr('rx', 4);

      if (i > 0) {
        chartArea.append('line')
          .attr('x1', 0)
          .attr('x2', width)
          .attr('y1', y)
          .attr('y2', y)
          .attr('stroke', 'rgba(255,255,255,0.06)')
          .attr('stroke-dasharray', '4,4');
      }

      g.append('text')
        .attr('x', 6)
        .attr('y', y + 16)
        .attr('fill', SOURCE_COLORS[source])
        .attr('font-size', '9px')
        .attr('font-family', 'monospace')
        .attr('text-transform', 'uppercase')
        .attr('letter-spacing', '0.05em')
        .attr('opacity', 0.8)
        .text(source.toUpperCase());
    });

    // --- Incident bars (bottom lane) ---
    const incidentY = margin.top + 3 * laneHeight + 8;
    const timelineIncidents = incidents.filter((inc) => {
      const created = new Date(inc.created_at);
      const resolved = inc.resolved_at ? new Date(inc.resolved_at) : now;
      return resolved >= start && created <= now;
    });

    // Incident lane label
    g.append('text')
      .attr('x', 6)
      .attr('y', incidentY - 2)
      .attr('fill', '#ff6b6b')
      .attr('font-size', '9px')
      .attr('font-family', 'monospace')
      .attr('opacity', 0.8)
      .text('INCIDENTS');

    // ─── Stagger overlapping incident bars vertically ───
    const barHeight = 20;
    const barGap = 3;
    const barRows: { x1: number; x2: number; row: number }[] = [];

    // Sort by start time so we assign rows left-to-right
    const sortedIncidents = [...timelineIncidents].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Assign each incident to the first row where it doesn't overlap
    const incidentRowMap = new Map<string, number>();
    sortedIncidents.forEach((inc) => {
      const x1 = Math.max(0, xScale(new Date(inc.created_at)));
      const x2 = Math.min(width, xScale(inc.resolved_at ? new Date(inc.resolved_at) : now));

      let assignedRow = 0;
      for (let row = 0; row < 5; row++) {
        const overlaps = barRows.some(
          (b) => b.row === row && !(x2 < b.x1 || x1 > b.x2)
        );
        if (!overlaps) {
          assignedRow = row;
          break;
        }
        assignedRow = row + 1;
      }

      barRows.push({ x1, x2, row: assignedRow });
      incidentRowMap.set(inc.id, assignedRow);
    });

    const incidentBars = chartArea.selectAll('.incident-bar')
      .data(timelineIncidents)
      .join('g')
      .attr('class', 'incident-bar');

    incidentBars.each(function (d) {
      const group = d3.select(this);
      const x1 = Math.max(0, xScale(new Date(d.created_at)));
      const x2 = Math.min(width, xScale(d.resolved_at ? new Date(d.resolved_at) : now));
      const barWidth = Math.max(4, x2 - x1);
      const row = incidentRowMap.get(d.id) || 0;
      const yOffset = incidentY + row * (barHeight + barGap);

      group.append('rect')
        .attr('x', x1)
        .attr('y', yOffset)
        .attr('width', barWidth)
        .attr('height', barHeight)
        .attr('rx', 4)
        .attr('fill', INCIDENT_COLORS[d.severity] || '#6b7280')
        .attr('opacity', d.status === 'resolved' ? 0.25 : 0.5)
        .style('cursor', 'pointer');

      if (barWidth > 80) {
        const maxChars = Math.floor((barWidth - 16) / 6);
        const label = d.title.length > maxChars ? d.title.substring(0, maxChars) + '\u2026' : d.title;
        group.append('text')
          .attr('x', x1 + 8)
          .attr('y', yOffset + 13)
          .attr('fill', 'white')
          .attr('font-size', '8px')
          .attr('font-family', 'monospace')
          .text(label);
      }
    });

    // --- Event dots ---
    const eventDots = chartArea.selectAll('.event-dot')
      .data(events)
      .join('g')
      .attr('class', 'event-dot')
      .style('cursor', 'pointer');

    eventDots.append('circle')
      .attr('cx', (d) => xScale(new Date(d.occurred_at)))
      .attr('cy', (d) => yLane(d.source))
      .attr('r', (d) => {
        if (d.severity === 'critical') return 6;
        if (d.severity === 'error') return 5;
        return 4;
      })
      .attr('fill', (d) => SEVERITY_COLORS[d.severity] || '#60a5fa')
      .attr('stroke', (d) => SOURCE_COLORS[d.source] || '#666')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.85);

    // Pulse ring for critical events
    eventDots.filter((d) => d.severity === 'critical')
      .append('circle')
      .attr('cx', (d) => xScale(new Date(d.occurred_at)))
      .attr('cy', (d) => yLane(d.source))
      .attr('r', 6)
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 1)
      .attr('opacity', 0.5);

    // --- Tooltip ---
    const tooltip = d3.select(tooltipRef.current);

    function formatTooltipTime(dateStr: string): string {
      const d = new Date(dateStr);
      return d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
      });
    }

    function positionTooltip(mouseX: number, mouseY: number) {
      const tooltipWidth = 240;
      const tooltipHeight = 60;

      let left = mouseX + margin.left + 14;
      if (left + tooltipWidth > dimensions.width) {
        left = mouseX + margin.left - tooltipWidth - 14;
      }

      let top = mouseY - 8;
      if (top + tooltipHeight > dimensions.height) {
        top = mouseY - tooltipHeight - 8;
      }

      return { left, top };
    }

    eventDots
      .on('mouseenter', function (event, d) {
        const [mx, my] = d3.pointer(event, svgRef.current);
        const pos = positionTooltip(mx, my);

        tooltip
          .style('opacity', '1')
          .style('left', `${pos.left}px`)
          .style('top', `${pos.top}px`)
          .html(`
            <div style="font-size:11px;font-weight:600;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px;">${d.title}</div>
            <div style="font-size:9px;display:flex;gap:6px;align-items:center;margin-top:4px;white-space:nowrap;">
              <span style="color:${SOURCE_COLORS[d.source]};text-transform:uppercase;font-family:monospace;">${d.source}</span>
              <span style="color:rgba(255,255,255,0.3);">&#183;</span>
              <span style="color:${SEVERITY_COLORS[d.severity]}">${d.severity}</span>
              <span style="color:rgba(255,255,255,0.3);">&#183;</span>
              <span style="color:rgba(255,255,255,0.5);">${formatTooltipTime(d.occurred_at)}</span>
            </div>
          `);

        d3.select(this).select('circle').transition().duration(150)
          .attr('r', (d: any) => (d.severity === 'critical' ? 9 : d.severity === 'error' ? 8 : 7))
          .attr('opacity', 1);
      })
      .on('mouseleave', function () {
        tooltip.style('opacity', '0');

        d3.select(this).select('circle').transition().duration(150)
          .attr('r', (d: any) => (d.severity === 'critical' ? 6 : d.severity === 'error' ? 5 : 4))
          .attr('opacity', 0.85);
      });

    // Incident bar tooltips
    incidentBars
      .on('mouseenter', function (event, d) {
        const [mx, my] = d3.pointer(event, svgRef.current);
        const pos = positionTooltip(mx, my);
        const statusLabel = d.status.charAt(0).toUpperCase() + d.status.slice(1);

        tooltip
          .style('opacity', '1')
          .style('left', `${pos.left}px`)
          .style('top', `${pos.top}px`)
          .html(`
            <div style="font-size:11px;font-weight:600;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px;">${d.title}</div>
            <div style="font-size:9px;display:flex;gap:6px;align-items:center;margin-top:4px;white-space:nowrap;">
              <span style="color:${INCIDENT_COLORS[d.severity]};text-transform:uppercase;font-family:monospace;">${d.severity}</span>
              <span style="color:rgba(255,255,255,0.3);">&#183;</span>
              <span style="color:rgba(255,255,255,0.5);">${statusLabel}</span>
              <span style="color:rgba(255,255,255,0.3);">&#183;</span>
              <span style="color:rgba(255,255,255,0.5);">${d.resolved_at ? 'Resolved' : 'Ongoing'}</span>
            </div>
          `);
      })
      .on('mouseleave', function () {
        tooltip.style('opacity', '0');
      });

    // ─── Annotation markers ───
    const annotationGroup = chartArea.append('g').attr('class', 'annotations-group');

    const visibleAnnotations = annotations.filter((a) => {
      const t = new Date(a.timestamp_target);
      return t >= start && t <= now;
    });

    visibleAnnotations.forEach((a) => {
      const ax = xScale(new Date(a.timestamp_target));
      const ay = margin.top + 10;

      const ag = annotationGroup.append('g')
        .attr('class', 'annotation-marker')
        .attr('data-id', a.id)
        .style('cursor', 'pointer');

      // Vertical dashed line
      ag.append('line')
        .attr('x1', ax).attr('x2', ax)
        .attr('y1', margin.top).attr('y2', height + margin.top)
        .attr('stroke', '#fbbf24')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.3);

      // Diamond marker
      ag.append('path')
        .attr('d', `M${ax},${ay - 6} L${ax + 5},${ay} L${ax},${ay + 6} L${ax - 5},${ay} Z`)
        .attr('fill', '#fbbf24')
        .attr('stroke', '#1a1a2e')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.9);

      // Tooltip on hover
      ag.on('mouseenter', (event: any) => {
          const [mx, my] = d3.pointer(event, svgRef.current);
          const pos = positionTooltip(mx, my);
          tooltip
            .style('opacity', '1')
            .style('left', `${pos.left}px`)
            .style('top', `${pos.top}px`)
            .html(`
              <div style="font-size:11px;font-weight:600;color:#fbbf24;margin-bottom:4px;">📌 Annotation</div>
              <div style="font-size:11px;color:white;max-width:210px;word-wrap:break-word;">${a.content}</div>
              <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:4px;">
                ${a.user_id} · ${new Date(a.timestamp_target).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            `);
        })
        .on('mouseleave', () => {
          tooltip.style('opacity', '0');
        });
    });

    // ─── Click-to-annotate handler ───
    // Invisible overlay rect for capturing clicks in annotate mode
    const clickOverlay = chartArea.append('rect')
      .attr('class', 'annotate-overlay')
      .attr('x', 0)
      .attr('y', margin.top)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .style('cursor', annotateModeRef.current ? 'crosshair' : 'default')
      .style('pointer-events', annotateModeRef.current ? 'all' : 'none')
      .on('click', (event: any) => {
        if (!annotateModeRef.current) return;
        const [mx] = d3.pointer(event);
        // Use current zoom transform to get the correct timestamp
        const currentX = currentTransformRef.current.rescaleX(xScale);
        const timestamp = currentX.invert(mx);
        setAnnotateModal({ timestamp, x: event.clientX, y: event.clientY });
      });

    // --- Adaptive tick format ---
    function makeTickFormat(scale: d3.ScaleTime<number, number>) {
      return (d: Date | d3.NumberValue) => {
        const date = d as Date;
        const domain = scale.domain();
        const domainSpanHours = (domain[1].getTime() - domain[0].getTime()) / 3600000;

        if (domainSpanHours < 48) {
          return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }
        if (domainSpanHours < 168) {
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
            date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).toLowerCase();
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };
    }

    // --- X Axis ---
    const xAxis = d3.axisBottom(xScale)
      .ticks(range === '6h' ? 6 : range === '24h' ? 8 : range === '7d' ? 7 : 10)
      .tickFormat(makeTickFormat(xScale) as any);

    const axisGroup = g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height + margin.top})`)
      .call(xAxis);

    axisGroup.selectAll('text')
      .attr('fill', 'rgba(255,255,255,0.4)')
      .attr('font-size', '9px')
      .attr('font-family', 'monospace');
    axisGroup.selectAll('line').attr('stroke', 'rgba(255,255,255,0.1)');
    axisGroup.select('.domain').attr('stroke', 'rgba(255,255,255,0.1)');

    // --- Vertical gridlines ---
    const gridlines = g.append('g')
      .attr('class', 'gridlines')
      .attr('transform', `translate(0,${margin.top})`);

    xScale.ticks(range === '6h' ? 6 : range === '24h' ? 8 : 7).forEach((tick) => {
      gridlines.append('line')
        .attr('x1', xScale(tick))
        .attr('x2', xScale(tick))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', 'rgba(255,255,255,0.03)')
        .attr('stroke-dasharray', '2,4');
    });

    // --- "Now" marker ---
    const nowX = xScale(now);
    if (nowX >= 0 && nowX <= width) {
      chartArea.append('line')
        .attr('class', 'now-line')
        .attr('x1', nowX)
        .attr('x2', nowX)
        .attr('y1', margin.top)
        .attr('y2', height + margin.top)
        .attr('stroke', '#00e5a0')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.5);

      chartArea.append('text')
        .attr('class', 'now-label')
        .attr('x', nowX)
        .attr('y', margin.top - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', '#00e5a0')
        .attr('font-size', '8px')
        .attr('font-family', 'monospace')
        .attr('opacity', 0.6)
        .text('NOW');
    }

    // --- Zoom behavior ---
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 20])
      .translateExtent([[0, 0], [width, height]])
      .extent([[0, 0], [width, height]])
      .filter((event: any) => {
        if (event.type === 'wheel') return true;
        if (event.type === 'dblclick') return false;

        // Block drag-to-pan when brush mode is active
        if (brushModeRef.current) return false;

        if (event.type === 'mousedown' || event.type === 'touchstart') {
          const target = event.target as Element;
          let el: Element | null = target;
          while (el && el !== svgRef.current) {
            if (el.classList && (el.classList.contains('event-dot') || el.classList.contains('incident-bar'))) {
              return false;
            }
            el = el.parentElement;
          }
          return true;
        }
        return false;
      })
      .on('zoom', (event) => {
        currentTransformRef.current = event.transform;
        const newX = event.transform.rescaleX(xScale);

        chartArea.selectAll('.event-dot circle')
          .attr('cx', (d: any) => newX(new Date(d.occurred_at)));

        incidentBars.each(function (d) {
          const group = d3.select(this);
          const x1 = Math.max(0, newX(new Date(d.created_at)));
          const x2 = Math.min(width, newX(d.resolved_at ? new Date(d.resolved_at) : now));
          const barWidth = Math.max(4, x2 - x1);
          const row = incidentRowMap.get(d.id) || 0;
          const yOffset = incidentY + row * (barHeight + barGap);

          group.select('rect').attr('x', x1).attr('width', barWidth);

          const text = group.select('text');
          if (barWidth > 80) {
            const maxChars = Math.floor((barWidth - 16) / 6);
            const label = d.title.length > maxChars ? d.title.substring(0, maxChars) + '\u2026' : d.title;
            if (text.empty()) {
              group.append('text')
                .attr('x', x1 + 8).attr('y', yOffset + 13)
                .attr('fill', 'white').attr('font-size', '8px').attr('font-family', 'monospace')
                .text(label);
            } else {
              text.attr('x', x1 + 8).text(label);
            }
          } else {
            text.remove();
          }
        });

        const adaptiveAxis = d3.axisBottom(newX)
          .ticks(range === '6h' ? 6 : range === '24h' ? 8 : range === '7d' ? 7 : 10)
          .tickFormat(makeTickFormat(newX) as any);

        axisGroup.call(adaptiveAxis);
        axisGroup.selectAll('text')
          .attr('fill', 'rgba(255,255,255,0.4)')
          .attr('font-size', '9px')
          .attr('font-family', 'monospace');
        axisGroup.selectAll('line').attr('stroke', 'rgba(255,255,255,0.1)');
        axisGroup.select('.domain').attr('stroke', 'rgba(255,255,255,0.1)');

        const newNowX = newX(now);
        chartArea.select('.now-line').attr('x1', newNowX).attr('x2', newNowX);
        chartArea.select('.now-label').attr('x', newNowX);

        gridlines.selectAll('line').remove();
        newX.ticks(range === '6h' ? 6 : range === '24h' ? 8 : 7).forEach((tick: Date) => {
          gridlines.append('line')
            .attr('x1', newX(tick)).attr('x2', newX(tick))
            .attr('y1', 0).attr('y2', height)
            .attr('stroke', 'rgba(255,255,255,0.03)').attr('stroke-dasharray', '2,4');
        });

        // Update annotation positions
        annotationGroup.selectAll('.annotation-marker').each(function () {
          const marker = d3.select(this);
          const id = marker.attr('data-id');
          const ann = visibleAnnotations.find((a) => a.id === id);
          if (!ann) return;
          const newAx = newX(new Date(ann.timestamp_target));
          const ay = margin.top + 10;
          marker.select('line').attr('x1', newAx).attr('x2', newAx);
          marker.select('path')
            .attr('d', `M${newAx},${ay - 6} L${newAx + 5},${ay} L${newAx},${ay + 6} L${newAx - 5},${ay} Z`);
        });
      });

    svg.call(zoom);
    svg.on('dblclick.zoom', null);
    svg.on('click.zoom', null);

    // ─── D3 Brush for time-range selection ───
    const brush = d3.brushX<unknown>()
      .extent([[0, margin.top], [width, height + margin.top]])
      .on('end', (event: any) => {
        if (!event.selection) return;

        const [x0, x1] = event.selection as [number, number];

        // Clear the brush visual immediately
        brushGroup.call(brush.move, null);

        // Don't zoom if selection is too small (< 10px = accidental click)
        if (Math.abs(x1 - x0) < 10) return;

        // Convert pixel selection to zoom transform
        const scaleBy = width / (x1 - x0);
        const translateX = -x0 * scaleBy;

        const newTransform = d3.zoomIdentity
          .translate(translateX, 0)
          .scale(scaleBy);

        // Apply with smooth animated transition
        svg.transition()
          .duration(750)
          .ease(d3.easeCubicInOut)
          .call(zoom.transform as any, newTransform);

        currentTransformRef.current = newTransform;

        // Auto-exit brush mode after selection
        setBrushMode(false);
        brushModeRef.current = false;
      });

    const brushGroup = g.append('g')
      .attr('class', 'brush-group')
      .style('display', 'none'); // Hidden by default — toggled via React state

    brushGroup.call(brush);

    // Style the brush selection rectangle
    brushGroup.selectAll('.selection')
      .attr('fill', 'rgba(0,229,160,0.15)')
      .attr('stroke', '#00e5a0')
      .attr('stroke-width', 1)
      .attr('rx', 4);

    // Style brush handles
    brushGroup.selectAll('.handle')
      .attr('fill', '#00e5a0')
      .attr('rx', 2);

    // Store brush reference for toggling
    const brushGroupNode = brushGroup;

    // Toggle brush visibility based on current mode
    if (brushModeRef.current) {
      brushGroupNode.style('display', '');
    }

    // ─── Timeline cursor overlay for other users ───
    const cursorOverlayGroup = g.append('g').attr('class', 'timeline-cursors');

    // ─── Mousemove on SVG: send hovered timestamp to other users ───
    const throttleRef = { last: 0 };
    svg.on('mousemove.timeline_cursor', (event: any) => {
      const now2 = Date.now();
      if (now2 - throttleRef.last < 50) return; // throttle to ~20fps
      throttleRef.last = now2;

      const [mx] = d3.pointer(event, g.node());
      if (mx < 0 || mx > width) return;

      // Apply current zoom transform to get the correct timestamp
      const currentXScale = currentTransformRef.current !== d3.zoomIdentity
        ? currentTransformRef.current.rescaleX(xScale)
        : xScale;
      const hoveredDate = currentXScale.invert(mx);
      sendTimelineCursor(hoveredDate.toISOString());
    });

    svg.on('mouseleave.timeline_cursor', () => {
      sendTimelineCursor(null);
    });

    zoomRef.current = zoom;

    if (currentTransformRef.current !== d3.zoomIdentity) {
      svg.call(zoom.transform, currentTransformRef.current);
    }

  }, [events, incidents, annotations, dimensions, range, loading]);

  // Toggle brush visibility when brushMode changes
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const brushGroup = svg.select('.brush-group');
    if (!brushGroup.empty()) {
      brushGroup.style('display', brushMode ? '' : 'none');
      svg.style('cursor', brushMode ? 'crosshair' : '');
    }
  }, [brushMode]);

  // Toggle annotate overlay when annotateMode changes
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const overlay = svg.select('.annotate-overlay');
    if (!overlay.empty()) {
      overlay.style('pointer-events', annotateMode ? 'all' : 'none');
      overlay.style('cursor', annotateMode ? 'crosshair' : 'default');
    }
    if (!brushMode) {
      svg.style('cursor', annotateMode ? 'crosshair' : '');
    }
  }, [annotateMode, brushMode]);

  // Submit annotation
  async function submitAnnotation() {
    if (!annotateModal || !annotateText.trim()) return;
    try {
      const res = await fetch(`/api/teams/${TEAM_ID}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: annotateText,
          timestampTarget: annotateModal.timestamp.toISOString(),
          userId: 'demo-user',
        }),
      });
      if (res.ok) {
        const newAnnotation = await res.json();
        setAnnotations((prev) => [...prev, newAnnotation]);
      }
    } catch (err) {
      console.error('Failed to create annotation:', err);
    } finally {
      setAnnotateModal(null);
      setAnnotateText('');
      setAnnotateMode(false);
      annotateModeRef.current = false;
    }
  }

  // ─── Render other users' timeline cursors ───
  useEffect(() => {
    if (!svgRef.current || !xScaleRef.current) return;
    const svg = d3.select(svgRef.current);
    const cursorGroup = svg.select('.timeline-cursors');
    if (cursorGroup.empty()) return;

    cursorGroup.selectAll('*').remove();

    const currentXScale = currentTransformRef.current !== d3.zoomIdentity
      ? currentTransformRef.current.rescaleX(xScaleRef.current)
      : xScaleRef.current;

    const margin = { top: 30, bottom: 40 };
    const chartHeight = dimensions.height - margin.top - margin.bottom;

    timelineCursors.forEach((cursor) => {
      const t = new Date(cursor.timestamp);
      const cx = currentXScale(t);
      if (cx < 0 || cx > dimensions.width) return;

      // Vertical line
      cursorGroup.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', margin.top).attr('y2', chartHeight + margin.top)
        .attr('stroke', cursor.color)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,3')
        .attr('opacity', 0.6);

      // Name label pill at top
      const labelG = cursorGroup.append('g')
        .attr('transform', `translate(${cx}, ${margin.top - 2})`);

      const labelWidth = cursor.userName.length * 6 + 12;

      labelG.append('rect')
        .attr('x', -2)
        .attr('y', -14)
        .attr('width', labelWidth)
        .attr('height', 16)
        .attr('rx', 8)
        .attr('fill', cursor.color)
        .attr('opacity', 0.9);

      labelG.append('text')
        .attr('x', 4)
        .attr('y', -2)
        .attr('fill', '#000')
        .attr('font-size', '9px')
        .attr('font-family', 'monospace')
        .attr('font-weight', '600')
        .text(cursor.userName);
    });
  }, [timelineCursors, dimensions]);

  const resetZoom = () => {
    if (svgRef.current && zoomRef.current) {
      currentTransformRef.current = d3.zoomIdentity;
      // Animated reset with easing
      d3.select(svgRef.current)
        .transition()
        .duration(500)
        .ease(d3.easeCubicInOut)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text-primary">Activity Timeline</h2>
          <div className="flex items-center gap-4 ml-4">
            {(['github', 'sentry', 'uptime'] as const).map((source) => (
              <div key={source} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SOURCE_COLORS[source] }} />
                <span className="text-[9px] font-mono uppercase text-text-dim tracking-wider">{source}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {(['6h', '24h', '7d', '30d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); currentTransformRef.current = d3.zoomIdentity; }}
              className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
                range === r
                  ? 'bg-accent-green/10 text-accent-green border border-accent-green/30'
                  : 'text-text-dim hover:text-text-primary border border-transparent'
              }`}
            >
              {r}
            </button>
          ))}
          <button
            onClick={resetZoom}
            className="ml-2 px-2 py-1 rounded text-[10px] font-mono text-text-dim hover:text-text-primary border border-border hover:border-accent-green/30 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={() => setBrushMode(!brushMode)}
            className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
              brushMode
                ? 'bg-accent-green/15 text-accent-green border border-accent-green/40'
                : 'text-text-dim hover:text-text-primary border border-border hover:border-accent-green/30'
            }`}
            title="Drag to select a time range and zoom in"
          >
            Select
          </button>
          <button
            onClick={() => { setAnnotateMode(!annotateMode); if (brushMode) setBrushMode(false); }}
            className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
              annotateMode
                ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/40'
                : 'text-text-dim hover:text-text-primary border border-border hover:border-yellow-400/30'
            }`}
            title="Click on the timeline to drop an annotation"
          >
            Annotate{annotations.length > 0 ? ` (${annotations.length})` : ''}
          </button>
        </div>
      </div>

      {/* Chart container */}
      <div ref={containerRef} className="flex-1 relative min-h-0">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="skeleton w-full h-full absolute inset-0 rounded-lg" />
          </div>
        ) : events.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-text-dim text-sm">
            No events in this time range
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              width={dimensions.width}
              height={dimensions.height}
              className="select-none"
            />
            {/* Tooltip */}
            <div
              ref={tooltipRef}
              className="absolute pointer-events-none z-50 rounded-lg px-3 py-2 shadow-xl"
              style={{
                opacity: 0,
                transition: 'opacity 0.15s',
                backgroundColor: '#1a1a2e',
                border: '1px solid rgba(255,255,255,0.1)',
                width: '240px',
              }}
            />
          </>
        )}
      </div>

      {/* Footer hint */}
      <div className="mt-2 text-[9px] font-mono text-text-dim/40 text-center">
        {annotateMode
          ? 'Click on the timeline to drop an annotation · Click Annotate again to cancel'
          : brushMode
          ? 'Drag to select a time range · Click Select again to cancel'
          : 'Scroll to zoom · Drag to pan · Click Select to brush-zoom · Click Annotate to add notes'}
      </div>

      {/* Annotation Modal */}
      {annotateModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          }}
          onClick={() => { setAnnotateModal(null); setAnnotateText(''); }}
        >
          <div
            style={{
              background: '#1a1a2e',
              border: '1px solid rgba(251,191,36,0.3)',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '16px' }}>📌</span>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#fbbf24', fontFamily: 'monospace' }}>
                Add Annotation
              </h3>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', marginBottom: '12px' }}>
              {annotateModal.timestamp.toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
            </p>
            <textarea
              value={annotateText}
              onChange={(e) => setAnnotateText(e.target.value)}
              placeholder="What's happening at this point in time?"
              rows={3}
              autoFocus
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                color: '#ffffff',
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(251,191,36,0.4)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAnnotation(); }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setAnnotateModal(null); setAnnotateText(''); }}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
                  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)',
                  border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitAnnotation}
                disabled={!annotateText.trim()}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  background: annotateText.trim() ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.03)',
                  color: annotateText.trim() ? '#fbbf24' : 'rgba(255,255,255,0.2)',
                  border: `1px solid ${annotateText.trim() ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  cursor: annotateText.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Add Annotation
              </button>
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
              Ctrl+Enter to save
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
