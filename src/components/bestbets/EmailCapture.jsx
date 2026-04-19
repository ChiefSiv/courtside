// src/components/bestbets/EmailCapture.jsx

import { useState } from 'react';
import { logEmailSignup } from '../../supabaseQueries.js';

export function EmailCapture({ source = 'best-bets' }) {
  const [email,   setEmail]   = useState('');
  const [status,  setStatus]  = useState('idle'); // idle | loading | success | error

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    try {
      await logEmailSignup(email.trim(), source);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="bb-email-capture">
      <h3>Stay in the loop</h3>
      <p>Get notified about new features</p>

      {status === 'success' ? (
        <div className="bb-email-success">✓ You're in. We'll be in touch.</div>
      ) : (
        <form className="bb-email-form" onSubmit={handleSubmit}>
          <input
            className="bb-email-input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={status === 'loading'}
          />
          <button
            className="bb-email-submit"
            type="submit"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Saving…' : 'Notify me'}
          </button>
        </form>
      )}
      {status === 'error' && (
        <p style={{ color: '#dc2626', fontSize: '0.78rem', marginTop: 6 }}>
          Something went wrong. Try again.
        </p>
      )}
    </div>
  );
}