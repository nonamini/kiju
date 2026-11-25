/**
 * Firebase Config Parser utility.
 * Parses user input which may be:
 * - A pure JSON string: {"apiKey": "...", "projectId": "..."}
 * - A JS object snippet: const firebaseConfig = { apiKey: "...", projectId: "..." };
 * - Key-value lines
 *
 * Strictly English code, comments, identifiers (Rule 1).
 * Strictly TypeScript strict (Rule 2).
 */

import { FirebaseConfig } from '../services/firebase';

export function parseFirebaseConfigInput(rawInput: string): FirebaseConfig | null {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // 1. Try pure JSON parse first
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (isLikelyFirebaseConfig(parsed)) {
      return sanitizeConfig(parsed);
    }
  } catch {
    // Continue to regex / JS snippet parsing
  }

  // 2. Extract key-value pairs using regex (supports JS object literals or assignment snippets)
  const extractField = (key: string): string | undefined => {
    // Matches: key: "value", "key": 'value', key = "value"
    const regex = new RegExp(`['"]?${key}['"]?\\s*[:=]\\s*['"\`]([^'"\`]+)['"\`]`, 'i');
    const match = trimmed.match(regex);
    return match && match[1] ? match[1].trim() : undefined;
  };

  const candidate: Record<string, string | undefined> = {
    apiKey: extractField('apiKey'),
    authDomain: extractField('authDomain'),
    projectId: extractField('projectId'),
    storageBucket: extractField('storageBucket'),
    messagingSenderId: extractField('messagingSenderId'),
    appId: extractField('appId'),
  };

  if (isLikelyFirebaseConfig(candidate)) {
    return sanitizeConfig(candidate);
  }

  return null;
}

function isLikelyFirebaseConfig(obj: Record<string, unknown>): boolean {
  const apiKey = obj.apiKey;
  const projectId = obj.projectId;
  return (
    typeof apiKey === 'string' &&
    apiKey.length > 5 &&
    typeof projectId === 'string' &&
    projectId.length > 1
  );
}

function sanitizeConfig(obj: Record<string, unknown>): FirebaseConfig {
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    apiKey: str(obj.apiKey),
    authDomain: str(obj.authDomain),
    projectId: str(obj.projectId),
    storageBucket: str(obj.storageBucket),
    messagingSenderId: str(obj.messagingSenderId),
    appId: str(obj.appId),
  };
}
