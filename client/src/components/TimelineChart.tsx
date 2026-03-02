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
  const { lastEvent, metricsVersion } = useSocketContext();

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const hours = RANGE_HOURS[range];
      const from = new Date(Date.now() - hours * 3600000).toISOString();

      const [eventsRes, incidentsRes] = await Promise.all([
        fetch(`/api/teams/${TEAM_ID}/events?limit=500&from=${from}`),
        fetch(`/api/teams/${TEAM_ID}/incidents`),
      ]);

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events || []);
      }
      if (incidentsRes.ok) {
        const data = await incidentsRes.json();
        setIncidents(data || []);
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

  // React to live events
  useEffect(() => {
    if (!lastEvent) return;
    const normalized: TimelineEvent = {
      id: lastEvent.id,
      source: lastEvent.source as any,
      event_type: lastEvent.eventType,
      title: lastEvent.title,
      severity: lastEvent.severity as any,
      occurred_at: lastEvent.occurredAt,
    };
    setEvents((prev) => [normalized, ...prev]);
  }, [lastEvent]);

  // Refetch on metrics updates (catches any missed events)
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

    const xScale = d3.scaleTime().domain([start, now]).range([0, width]);

    const sources = ['github', 'sentry', 'uptime'] as const;
    const laneHeight = (height - 50) / 3;
    const yLane = (source: string) => {
      const idx = sources.indexOf(source as any);
      return idx >= 0 ? margin.top + idx * laneHeight + laneHeight / 2 : margin.top + height / 2;
    };

    const g = svg.append('g').attr('transform', `translate(${margin.left},0)`);

    svg.append('defs')
      .append('clipPath')
      .attr('id', 'timeline-clip')
      .append('rect')
      .attr('x', 0).attr('y', 0).attr('width', width)
      .attr('height', height + margin.top + margin.bottom);

    const chartArea = g.append('g').attr('clip-path', 'url(#timeline-clip)');

    // Lane backgrounds & labels
    sources.forEach((source, i) => {
      const y = margin.top + i * laneHeight;
      chartArea.append('rect')
        .attr('x', 0).attr('y', y).attr('width', width).attr('height', laneHeight)
        .attr('fill', i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.025)')
        .attr('rx', 4);
      if (i > 0) {
        chartArea.append('line')
          .attr('x1', 0).attr('x2', width).attr('y1', y).attr('y2', y)
          .attr('stroke', 'rgba(255,255,255,0.06)').attr('stroke-dasharray', '4,4');
      }
      g.append('text')
        .attr('x', 6).attr('y', y + 16)
        .attr('fill', SOURCE_COLORS[source]).attr('font-size', '9px')
        .attr('font-family', 'monospace').attr('opacity', 0.8)
        .text(source.toUpperCase());
    });

    // Incident bars
    const incidentY = margin.top + 3 * laneHeight + 8;
    const timelineIncidents = incidents.filter((inc) => {
      const created = new Date(inc.created_at);
      const resolved = inc.resolved_at ? new Date(inc.resolved_at) : now;
      return resolved >= start && created <= now;
    });

    g.append('text')
      .attr('x', 6).attr('y', incidentY - 2)
      .attr('fill', '#ff6b6b').attr('font-size', '9px')
      .attr('font-family', 'monospace').attr('opacity', 0.8)
      .text('INCIDENTS');

    const incidentBars = chartArea.selectAll('.incident-bar')
      .data(timelineIncidents).join('g').attr('class', 'incident-bar');

    incidentBars.each(function (d) {
      const group = d3.select(this);
      const x1 = Math.max(0, xScale(new Date(d.created_at)));
      const x2 = Math.min(width, xScale(d.resolved_at ? new Date(d.resolved_at) : now));
      const barWidth = Math.max(4, x2 - x1);

      group.append('rect')
        .attr('x', x1).attr('y', incidentY).attr('width', barWidth).attr('height', 20)
        .attr('rx', 4).attr('fill', INCIDENT_COLORS[d.severity] || '#6b7280')
        .attr('opacity', d.status === 'resolved' ? 0.25 : 0.5).style('cursor', 'pointer');

      if (barWidth > 80) {
        const maxChars = Math.floor((barWidth - 16) / 6);
        const label = d.title.length > maxChars ? d.title.substring(0, maxChars) + '…' : d.title;
        group.append('text')
          .attr('x', x1 + 8).attr('y', incidentY + 13)
          .attr('fill', 'white').attr('font-size', '8px').attr('font-family', 'monospace')
          .text(label);
      }
    });

    // Event dots
    const eventDots = chartArea.selectAll('.event-dot')
      .data(events).join('g').attr('class', 'event-dot').style('cursor', 'pointer');

    eventDots.append('circle')
      .attr('cx', (d) => xScale(new Date(d.occurred_at)))
      .attr('cy', (d) => yLane(d.source))
      .attr('r', (d) => d.severity === 'critical' ? 6 : d.severity === 'error' ? 5 : 4)
      .attr('fill', (d) => SEVERITY_COLORS[d.severity] || '#60a5fa')
      .attr('stroke', (d) => SOURCE_COLORS[d.source] || '#666')
      .attr('stroke-width', 1.5).attr('opacity', 0.85);

    eventDots.filter((d) => d.severity === 'critical')
      .append('circle')
      .attr('cx', (d) => xScale(new Date(d.occurred_at)))
      .attr('cy', (d) => yLane(d.source))
      .attr('r', 6).attr('fill', 'none').attr('stroke', '#ef4444')
      .attr('stroke-width', 1).attr('opacity', 0.5);

    // Tooltip helpers
    const tooltip = d3.select(tooltipRef.current);

    function formatTime(dateStr: string): string {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
      });
    }

    function positionTooltip(mx: number, my: number) {
      const tooltipW = 240;
      let left = mx + margin.left + 14;
      if (left + tooltipW > dimensions.width) left = mx + margin.left - tooltipW - 14;
      let top = my - 8;
      if (top + 60 > dimensions.height) top = my - 68;
      return { left, top };
    }

    eventDots
      .on('mouseenter', function (event, d) {
        const [mx, my] = d3.pointer(event, svgRef.current);
        const pos = positionTooltip(mx, my);
        tooltip.style('opacity', '1').style('left', `${pos.left}px`).style('top', `${pos.top}px`)
          .html(`
            <div style="font-size:11px;font-weight:600;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px;">${d.title}</div>
            <div style="font-size:9px;display:flex;gap:6px;align-items:center;margin-top:4px;white-space:nowrap;">
              <span style="color:${SOURCE_COLORS[d.source]};text-transform:uppercase;font-family:monospace;">${d.source}</span>
              <span style="color:rgba(255,255,255,0.3);">·</span>
              <span style="color:${SEVERITY_COLORS[d.severity]}">${d.severity}</span>
              <span style="color:rgba(255,255,255,0.3);">·</span>
              <span style="color:rgba(255,255,255,0.5);">${formatTime(d.occurred_at)}</span>
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

    incidentBars
      .on('mouseenter', function (event, d) {
        const [mx, my] = d3.pointer(event, svgRef.current);
        const pos = positionTooltip(mx, my);
        tooltip.style('opacity', '1').style('left', `${pos.left}px`).style('top', `${pos.top}px`)
          .html(`
            <div style="font-size:11px;font-weight:600;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px;">${d.title}</div>
            <div style="font-size:9px;display:flex;gap:6px;align-items:center;margin-top:4px;white-space:nowrap;">
              <span style="color:${INCIDENT_COLORS[d.severity]};text-transform:uppercase;font-family:monospace;">${d.severity}</span>
              <span style="color:rgba(255,255,255,0.3);">·</span>
              <span style="color:rgba(255,255,255,0.5);">${d.status.charAt(0).toUpperCase() + d.status.slice(1)}</span>
              <span style="color:rgba(255,255,255,0.3);">·</span>
              <span style="color:rgba(255,255,255,0.5);">${d.resolved_at ? 'Resolved' : 'Ongoing'}</span>
            </div>
          `);
      })
      .on('mouseleave', function () { tooltip.style('opacity', '0'); });

    // X Axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(range === '6h' ? 6 : range === '24h' ? 8 : range === '7d' ? 7 : 10)
      .tickFormat((d) => {
        const date = d as Date;
        return (range === '6h' || range === '24h')
          ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });

    const axisGroup = g.append('g').attr('transform', `translate(0,${height + margin.top})`).call(xAxis);
    axisGroup.selectAll('text').attr('fill', 'rgba(255,255,255,0.4)').attr('font-size', '9px').attr('font-family', 'monospace');
    axisGroup.selectAll('line').attr('stroke', 'rgba(255,255,255,0.1)');
    axisGroup.select('.domain').attr('stroke', 'rgba(255,255,255,0.1)');

    // Gridlines
    const gridlines = g.append('g').attr('transform', `translate(0,${margin.top})`);
    xScale.ticks(range === '6h' ? 6 : range === '24h' ? 8 : 7).forEach((tick) => {
      gridlines.append('line')
        .attr('x1', xScale(tick)).attr('x2', xScale(tick))
        .attr('y1', 0).attr('y2', height)
        .attr('stroke', 'rgba(255,255,255,0.03)').attr('stroke-dasharray', '2,4');
    });

    // "Now" marker
    const nowX = xScale(now);
    if (nowX >= 0 && nowX <= width) {
      chartArea.append('line').attr('class', 'now-line')
        .attr('x1', nowX).attr('x2', nowX)
        .attr('y1', margin.top).attr('y2', height + margin.top)
        .attr('stroke', '#00e5a0').attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3').attr('opacity', 0.5);
      chartArea.append('text').attr('class', 'now-label')
        .attr('x', nowX).attr('y', margin.top - 6).attr('text-anchor', 'middle')
        .attr('fill', '#00e5a0').attr('font-size', '8px')
        .attr('font-family', 'monospace').attr('opacity', 0.6).text('NOW');
    }

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 20])
      .translateExtent([[0, 0], [width, height]])
      .extent([[0, 0], [width, height]])
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
          group.select('rect').attr('x', x1).attr('width', barWidth);
          const text = group.select('text');
          if (barWidth > 80) {
            const maxChars = Math.floor((barWidth - 16) / 6);
            const label = d.title.length > maxChars ? d.title.substring(0, maxChars) + '…' : d.title;
            if (text.empty()) {
              group.append('text').attr('x', x1 + 8).attr('y', incidentY + 13)
                .attr('fill', 'white').attr('font-size', '8px').attr('font-family', 'monospace').text(label);
            } else { text.attr('x', x1 + 8).text(label); }
          } else { text.remove(); }
        });

        axisGroup.call(xAxis.scale(newX));
        axisGroup.selectAll('text').attr('fill', 'rgba(255,255,255,0.4)').attr('font-size', '9px').attr('font-family', 'monospace');
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
      });

    svg.call(zoom);
    zoomRef.current = zoom;
    if (currentTransformRef.current !== d3.zoomIdentity) {
      svg.call(zoom.transform, currentTransformRef.current);
    }
  }, [events, incidents, dimensions, range, loading]);

  const resetZoom = () => {
    if (svgRef.current && zoomRef.current) {
      currentTransformRef.current = d3.zoomIdentity;
      d3.select(svgRef.current).transition().duration(500)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  };

  return (
    <div className="flex flex-col h-full">
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
            <button key={r}
              onClick={() => { setRange(r); currentTransformRef.current = d3.zoomIdentity; }}
              className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
                range === r
                  ? 'bg-accent-green/10 text-accent-green border border-accent-green/30'
                  : 'text-text-dim hover:text-text-primary border border-transparent'
              }`}
            >{r}</button>
          ))}
          <button onClick={resetZoom}
            className="ml-2 px-2 py-1 rounded text-[10px] font-mono text-text-dim hover:text-text-primary border border-border hover:border-accent-green/30 transition-colors">
            Reset
          </button>
        </div>
      </div>

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
            <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="select-none" />
            <div ref={tooltipRef}
              className="absolute pointer-events-none z-50 rounded-lg px-3 py-2 shadow-xl"
              style={{ opacity: 0, transition: 'opacity 0.15s', backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', width: '240px' }}
            />
          </>
        )}
      </div>

      <div className="mt-2 text-[9px] font-mono text-text-dim/40 text-center">
        Scroll to zoom · Drag to pan
      </div>
    </div>
  );
}
