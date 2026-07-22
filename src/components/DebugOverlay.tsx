import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LogLine {
  id: number;
  text: string;
}

let nextId = 0;

export default function DebugOverlay() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [visible, setVisible] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const log = (text: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { id: nextId++, text: `[${ts}] ${text}` }]);
  };

  useEffect(() => {
    // 1) localStorage test
    try {
      const key = '__debug_ls_test';
      localStorage.setItem(key, '1');
      const read = localStorage.getItem(key);
      localStorage.removeItem(key);
      log(`localStorage: ${read === '1' ? 'OK' : 'FAILED (read mismatch)'}`);
    } catch (e) {
      log(`localStorage: FAILED (${e instanceof Error ? e.message : String(e)})`);
    }

    // 2) sessionStorage test
    try {
      const key = '__debug_ss_test';
      sessionStorage.setItem(key, '1');
      const read = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      log(`sessionStorage: ${read === '1' ? 'OK' : 'FAILED (read mismatch)'}`);
    } catch (e) {
      log(`sessionStorage: FAILED (${e instanceof Error ? e.message : String(e)})`);
    }

    // 3) navigator.locks
    log(`navigator.locks: ${typeof navigator !== 'undefined' && 'locks' in navigator ? 'EXISTS' : 'MISSING'}`);

    // 4) userAgent
    log(`UA: ${navigator.userAgent}`);

    // 5) getSession
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        log(`getSession: ERROR — ${error.message}`);
      } else if (data.session) {
        log(`getSession: session OK (user ${data.session.user.id.slice(0, 8)}…)`);
      } else {
        log('getSession: null (no session)');
      }
    });

    // 6) onAuthStateChange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      log(`auth: ${event} → ${session ? `session OK (user ${session.user.id.slice(0, 8)}…)` : 'null'}`);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto-scroll to bottom on new log lines
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          zIndex: 99999,
          background: 'black',
          color: '#0f0',
          fontFamily: 'monospace',
          fontSize: 10,
          padding: '2px 6px',
          border: '1px solid #0f0',
          borderTopRightRadius: 4,
          cursor: 'pointer',
        }}
      >
        DEBUG
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '40vh',
        zIndex: 99999,
        background: 'rgba(0,0,0,0.92)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: '16px',
        padding: '6px 8px',
        overflowY: 'auto',
        borderTop: '1px solid #0f0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <strong style={{ color: '#0f0' }}>DEBUG OVERLAY</strong>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: 'transparent',
            color: '#0f0',
            border: '1px solid #0f0',
            borderRadius: 3,
            padding: '0 6px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: 11,
          }}
        >
          ✕
        </button>
      </div>
      <div ref={scrollRef} style={{ maxHeight: 'calc(40vh - 30px)', overflowY: 'auto' }}>
        {logs.map((l) => (
          <div key={l.id} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {l.text}
          </div>
        ))}
        {logs.length === 0 && <div style={{ color: '#888' }}>Initializing…</div>}
      </div>
    </div>
  );
}
