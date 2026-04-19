// src/components/bestbets/FilterBar.jsx

const ALL_STATS = ['PTS', 'REB', 'AST', '3PM', 'STL', 'BLK', 'TOV', 'PRA', 'PR', 'PA', 'RA', 'DD'];

const DEFAULT_FILTERS = {
  statTypes:    ALL_STATS,
  excludeTeams: [],
  oddsMin:      -2000,
  oddsMax:      2000,
  minEV:        0,
};

/**
 * FilterBar
 * @param {{ filters, onChange }} props
 */
export function FilterBar({ filters, onChange }) {
  function toggleStat(stat) {
    const next = filters.statTypes.includes(stat)
      ? filters.statTypes.filter(s => s !== stat)
      : [...filters.statTypes, stat];
    onChange({ ...filters, statTypes: next });
  }

  function handleReset() {
    onChange(DEFAULT_FILTERS);
  }

  const inner = (
    <>
      {/* Stat type multi-select chips */}
      <div className="bb-filter-group">
        <div className="bb-filter-label">Stat</div>
        <div className="bb-filter-multiselect">
          {ALL_STATS.map(s => (
            <button
              key={s}
              className={`bb-filter-chip${filters.statTypes.includes(s) ? ' active' : ''}`}
              onClick={() => toggleStat(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Min EV slider */}
      <div className="bb-filter-group">
        <div className="bb-filter-label">Min EV%</div>
        <div className="bb-filter-slider-row">
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={filters.minEV}
            onChange={e => onChange({ ...filters, minEV: parseFloat(e.target.value) })}
          />
          <span>{filters.minEV > 0 ? `+${filters.minEV}%` : 'Any'}</span>
        </div>
      </div>

      {/* Odds min */}
      <div className="bb-filter-group">
        <div className="bb-filter-label">Min Odds</div>
        <div className="bb-filter-slider-row">
          <input
            type="range"
            min={-500}
            max={500}
            step={10}
            value={filters.oddsMin}
            onChange={e => onChange({ ...filters, oddsMin: parseInt(e.target.value) })}
          />
          <span style={{ minWidth: 40 }}>
            {filters.oddsMin > 0 ? `+${filters.oddsMin}` : filters.oddsMin}
          </span>
        </div>
      </div>

      {/* Odds max */}
      <div className="bb-filter-group">
        <div className="bb-filter-label">Max Odds</div>
        <div className="bb-filter-slider-row">
          <input
            type="range"
            min={-500}
            max={1500}
            step={50}
            value={filters.oddsMax}
            onChange={e => onChange({ ...filters, oddsMax: parseInt(e.target.value) })}
          />
          <span style={{ minWidth: 40 }}>
            {filters.oddsMax > 0 ? `+${filters.oddsMax}` : filters.oddsMax}
          </span>
        </div>
      </div>

      {/* Reset */}
      <div className="bb-filter-actions">
        <button className="bb-filter-reset" onClick={handleReset}>Reset</button>
      </div>
    </>
  );

  return (
    <div className="bb-filters">{inner}</div>
  );
}