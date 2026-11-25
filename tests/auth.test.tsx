import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AuthProvider } from '../src/contexts/AuthContext';
import { AuthStatusButton } from '../src/components/auth/AuthStatusButton';
import { isFirebaseConfigured } from '../src/services/firebase';
import '../src/locales/i18n';

describe('Firebase Configuration & Sandbox Mode', () => {
  it('detects firebase configured state from environment', () => {
    // Returns boolean reflecting environment status
    expect(typeof isFirebaseConfigured()).toBe('boolean');
  });
});

describe('AuthStatusButton component rendering', () => {
  it('renders auth status component inside AuthProvider', () => {
    const html = renderToString(
      <AuthProvider>
        <AuthStatusButton />
      </AuthProvider>
    );

    // Renders either loading indicator or action button
    expect(html).toBeTruthy();
    expect(html.length).toBeGreaterThan(10);
  });

  it('renders correctly wrapped inside AuthProvider without throwing', () => {
    expect(() => {
      renderToString(
        <AuthProvider>
          <div className="test-wrapper">
            <AuthStatusButton />
          </div>
        </AuthProvider>
      );
    }).not.toThrow();
  });
});
