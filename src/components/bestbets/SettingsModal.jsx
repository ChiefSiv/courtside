// src/components/bestbets/SettingsModal.jsx

const ALL_BOOKS = [
  'draftkings', 'fanduel', 'betmgm', 'caesars',
  'pointsbet', 'bet365', 'espnbet', 'fanatics',
];

export function SettingsModal({ settings, onChange, onClose }) {
  function toggleBook(book) {
    const next = settings.preferredBooks.includes(book)
      ? settings.preferredBooks.filter(b => b !== book)
      : [...settings.preferredBooks, book];
    // Always keep at least one book
    if (next.length === 0) return;
    onChange({ ...settings, preferredBooks: next });
  }

  return (
    <div className="bb-modal-overlay" onClick={onClose}>
      <div className="bb-modal" onClick={e => e.stopPropagation()}>
        <h3 className="bb-modal-title">⚙ Settings</h3>

        <div className="bb-modal-section-label">Preferred Sportsbooks</div>
        <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 10 }}>
          Cards show prices from selected books only.
          You'll still see "better elsewhere" alerts for unselected books.
        </p>
        <div className="bb-books-grid">
          {ALL_BOOKS.map(book => (
            <button
              key={book}
              className={`bb-filter-chip${settings.preferredBooks.includes(book) ? ' active' : ''}`}
              onClick={() => toggleBook(book)}
              style={{ textTransform: 'capitalize' }}
            >
              {book}
            </button>
          ))}
        </div>

        <div className="bb-modal-actions">
          <button className="bb-modal-btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}