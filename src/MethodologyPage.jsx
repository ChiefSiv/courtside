// src/MethodologyPage.jsx
// Public methodology explanation page.
// Route: /methodology

export function MethodologyPage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 64px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: 0 }}>
          How It Works
        </h1>
        <a href="#bestBets" style={{ fontSize: '0.82rem', color: '#3b82f6', textDecoration: 'none' }}>
          ← Back to Best Bets
        </a>
      </div>

      <Section title="What is CourtSide Best Bets?">
        CourtSide Best Bets is a data analysis tool that evaluates NBA player prop markets
        using statistical modeling, matchup analysis, and injury intelligence. It surfaces
        picks where our model projects a meaningful edge over the book's implied probability.
        It is a research tool, not a guarantee of outcomes.
      </Section>

      <Section title="The Composite Score">
        Every pick receives a composite score from 0–10 (displayed as stars out of 5).
        The score combines four signals: expected value, hit rate, matchup quality, and
        recent form. Expected value carries the most weight — it's the headline metric
        because it directly reflects the mathematical edge over the book. Hit rate,
        matchup, and form serve as secondary context and quality filters.
      </Section>

      <Section title="What is EV%?">
        Expected Value (EV%) is the percentage return per dollar wagered, assuming our
        model probability is correct. A positive EV% means the model believes the bet
        is priced favorably relative to the true probability. For example, +5% EV means
        the model expects to return $1.05 for every $1.00 wagered on average over time.
        EV is calculated by removing the book's vig (juice) from the odds to get a fair
        implied probability, then comparing that to our model's projected probability.
      </Section>

      <Section title="The Projection Model">
        For each qualifying bet, we build a projected stat value using the player's
        season average as a baseline, then apply a series of adjustments:
        <ul style={{ marginTop: 10, paddingLeft: 20, lineHeight: 1.8, fontSize: '0.85rem', color: '#374151' }}>
          <li><strong>Form adjustment</strong> — recent performance vs season average</li>
          <li><strong>Matchup adjustment</strong> — opponent's defensive performance at that position</li>
          <li><strong>Pace adjustment</strong> — game total (over/under) relative to league average</li>
          <li><strong>Rest adjustment</strong> — days of rest before the game</li>
          <li><strong>Schedule adjustment</strong> — back-to-backs and game density fatigue</li>
          <li><strong>Blowout adjustment</strong> — large spreads that affect star player minutes</li>
          <li><strong>Usage shift</strong> — redistribution of production when key teammates are out</li>
        </ul>
        Each adjustment is logged and visible in the expanded card view so you can see
        exactly what is driving the projection.
      </Section>

      <Section title="Matchup Evaluation">
        A matchup is considered favorable when at least 2 of 3 criteria are true: the
        opponent allows more production to the relevant position than league average,
        the opponent ranks in the bottom third of the league defending that stat, or
        the opponent's defensive trend over recent games is worsening. Matchup data
        comes from team defensive stats and is aligned with the position group
        (guards, wings, bigs) of the player in question.
      </Section>

      <Section title="Recent Form">
        Form is evaluated across three criteria: performance over the last 5 games vs
        the season average, whether the player hit the specific line in each of the last
        3 games, and whether minutes or usage is trending upward. All three must be true
        for a pick to qualify for the Longshots section. Straight Bets and Parlay Legs
        use form as a secondary scoring signal.
      </Section>

      <Section title="How is Hit Rate Calculated?">
        Hit rate is the percentage of the player's last 15 games where they exceeded
        the specific prop line being evaluated — not a general stat average. A player
        averaging 25 points may still only hit "Over 27.5 PTS" 60% of the time.
        Hit rate is always calculated against the exact line currently being offered.
      </Section>

      <Section title="What is CLV?">
        Closing Line Value (CLV) measures whether the odds you received were better
        than the line that closed immediately before tip-off. Positive CLV is considered
        one of the strongest indicators of long-term betting edge. Our track record
        reports CLV alongside win/loss results so you can evaluate the quality of the
        picks independently of short-term variance.
      </Section>

      <Section title="How Do You Handle Injuries?">
        Injuries affect picks in two ways. First, the Availability Gate: any player
        listed as OUT or QUESTIONABLE is excluded from all picks. Second, the Usage
        Shift module: when a key teammate is confirmed OUT, we look back at historical
        games where that teammate was also absent and calculate the actual impact on
        our target player's production. This is labeled on the card with a confidence
        level based on sample size.
      </Section>

      <Section title="The Three Sections">
        <strong>Best Straight Bets</strong> targets picks with strong positive expected
        value and favorable matchups — the highest-confidence plays for single-game
        wagering. <strong>Best Parlay Legs</strong> targets high hit-rate picks at
        favorite-range odds, suitable for combining into parlays.{' '}
        <strong>Data-Backed Longshots</strong> targets positive-EV plays at plus-money
        odds where form is trending strongly upward and the game environment is favorable.
      </Section>

      <FAQ />

      {/* Disclaimer */}
      <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 40, paddingTop: 20, fontSize: '0.72rem', color: '#9ca3af', lineHeight: 1.6 }}>
        CourtSide Best Bets is an analysis tool for entertainment purposes only. It is
        not a sportsbook and does not facilitate wagering. Past performance does not
        guarantee future results. Gambling involves risk — only wager what you can
        afford to lose. Must be 21+ and in a state where sports wagering is legal.
        If you or someone you know has a gambling problem, call 1-800-GAMBLER.
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: 8, marginTop: 0 }}>
        {title}
      </h2>
      <div style={{ fontSize: '0.88rem', color: '#374151', lineHeight: 1.75 }}>
        {children}
      </div>
    </div>
  );
}

function FAQ() {
  const faqs = [
    {
      q: 'Does CourtSide guarantee winning picks?',
      a: 'No. No tool can guarantee outcomes in sports betting. CourtSide identifies situations where the model projects a statistical edge, but variance is real and all gambling carries risk.',
    },
    {
      q: 'How often are picks updated?',
      a: 'Odds refresh every 30 seconds. Injury data refreshes every 60 seconds. Picks are generated fresh each time the page loads and update automatically in the background.',
    },
    {
      q: 'Why do some picks show "Lineup TBD"?',
      a: 'Starting lineups are typically confirmed 60–90 minutes before tip-off. Until confirmed, picks are shown with a "Lineup TBD" label. The availability gate will update automatically once lineups are official.',
    },
    {
      q: 'What does "Stretch Picks" mean?',
      a: 'When no picks meet the full EV threshold for a section, we show the best available options regardless of EV — labeled clearly as Stretch Picks. These are lower-confidence and shown for informational purposes only.',
    },
    {
      q: 'Which sportsbooks are supported?',
      a: 'Odds are sourced from all major US books via the BallDontLie API. You can filter to your preferred books in Settings. You\'ll always see a "better elsewhere" alert if a non-selected book has meaningfully better pricing.',
    },
  ];

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: 16, marginTop: 0 }}>
        Frequently Asked Questions
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {faqs.map((faq, i) => (
          <div key={i} style={{ borderLeft: '3px solid #3b82f6', paddingLeft: 14 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#111827', marginBottom: 4 }}>
              {faq.q}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.65 }}>
              {faq.a}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}