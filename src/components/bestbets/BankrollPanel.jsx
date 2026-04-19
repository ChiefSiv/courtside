// src/components/bestbets/BankrollPanel.jsx
import { useState } from 'react';

const PRESETS = [500, 1000, 2500, 5000, 10000];

export function BankrollPanel({ bankroll, onChange }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');

  function handlePreset(val) {
    onChange(val);
    setEditing(false);
  }

  function handleCustomSubmit() {
    const n = parseInt(inputVal.replace(/[^0-9]/g, ''));
    if (n > 0) onChange(n);
    setEditing(false);
    setInputVal('');
  }

  return (
    <div className="bb-bankroll-panel">
      <div className="bb-bankroll-header">
        <span className="bb-bankroll-label">💰 Bankroll</span>
        <span className="bb-bankroll-value">${bankroll.toLocaleString()}</span>
        <button className="bb-bankroll-edit-btn" onClick={() => setEditing(e => !e)}>
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {editing && (
        <div className="bb-bankroll-editor">
          <div className="bb-bankroll-presets">
            {PRESETS.map(p => (
              <button
                key={p}
                className={`bb-bankroll-preset${bankroll === p ? ' active' : ''}`}
                onClick={() => handlePreset(p)}
              >
                ${p.toLocaleString()}
              </button>
            ))}
          </div>
          <div className="bb-bankroll-custom-row">
            <span className="bb-bankroll-currency">$</span>
            <input
              type="number"
              className="bb-bankroll-input"
              placeholder="Custom amount"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCustomSubmit()}
              min={1}
            />
            <button className="bb-bankroll-set-btn" onClick={handleCustomSubmit}>Set</button>
          </div>
          <div className="bb-bankroll-note">
            1 unit = 1% = ${(bankroll * 0.01).toFixed(0)}. Kelly sizing applied per section.
          </div>
        </div>
      )}
    </div>
  );
}