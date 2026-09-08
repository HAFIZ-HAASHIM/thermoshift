import React from 'react';
import { Tent, Droplet, Snowflake, Wrench, MapPin } from 'lucide-react';
import { ResourceRecord } from '../types/schedule';

interface ResourceOverviewCardProps {
  resources: ResourceRecord[];
}

const RESOURCE_ICONS: Record<string, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  SHADE_STRUCTURE: { icon: Tent, color: 'text-amber-400', bg: 'bg-amber-950/40', border: 'border-amber-500/30' },
  WATER_STATION: { icon: Droplet, color: 'text-cyan-400', bg: 'bg-cyan-950/40', border: 'border-cyan-500/30' },
  COOLING_TENT: { icon: Snowflake, color: 'text-blue-400', bg: 'bg-blue-950/40', border: 'border-blue-500/30' },
  HEAVY_EQUIPMENT: { icon: Wrench, color: 'text-slate-400', bg: 'bg-slate-950/40', border: 'border-slate-500/30' }
};

export const ResourceOverviewCard: React.FC<ResourceOverviewCardProps> = ({ resources }) => {
  const totalCapacity = resources.reduce((acc, r) => acc + r.capacity, 0);

  return (
    <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg flex flex-col justify-between space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
            <Tent className="w-3.5 h-3.5" />
            <span>Physical Site Infrastructure</span>
          </div>
          <h3 className="text-lg font-bold text-white mt-0.5">Mitigation Resources</h3>
        </div>

        <div className="px-2.5 py-1 rounded-lg bg-amber-950/50 border border-amber-500/30 text-xs font-bold text-amber-300">
          {totalCapacity} Person Max Cap
        </div>
      </div>

      {/* Resources List */}
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {resources.map((res) => {
          const typeConfig = RESOURCE_ICONS[res.resource_type] || RESOURCE_ICONS.SHADE_STRUCTURE;
          const Icon = typeConfig.icon;

          return (
            <div
              key={res.id}
              className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-2 rounded-lg border shrink-0 ${typeConfig.bg} ${typeConfig.color} ${typeConfig.border}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs font-semibold text-white truncate">{res.name}</h5>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className="truncate">{res.zone_name}</span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-sm font-bold text-white">{res.capacity}</span>
                <span className="text-[10px] text-slate-400 block uppercase">Capacity</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
