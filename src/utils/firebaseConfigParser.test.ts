import { describe, it, expect } from 'vitest';
import { parseFirebaseConfigInput } from './firebaseConfigParser';

describe('parseFirebaseConfigInput', () => {
  it('parses valid JSON string', () => {
    const json = JSON.stringify({
      apiKey: 'AIzaSyExample1234567890',
      projectId: 'my-shogi-app',
      authDomain: 'my-shogi-app.firebaseapp.com',
    });
    const result = parseFirebaseConfigInput(json);
    expect(result).not.toBeNull();
    expect(result?.apiKey).toBe('AIzaSyExample1234567890');
    expect(result?.projectId).toBe('my-shogi-app');
  });

  it('parses JS snippet copied from Firebase Console', () => {
    const snippet = `
      // Your web app's Firebase configuration
      const firebaseConfig = {
        apiKey: "AIzaSyExampleCopiedFromConsole",
        authDomain: "my-shogi-project.firebaseapp.com",
        projectId: "my-shogi-project",
        storageBucket: "my-shogi-project.firebasestorage.app",
        messagingSenderId: "1234567890",
        appId: "1:1234567890:web:abcdef123456"
      };
    `;
    const result = parseFirebaseConfigInput(snippet);
    expect(result).not.toBeNull();
    expect(result?.apiKey).toBe('AIzaSyExampleCopiedFromConsole');
    expect(result?.projectId).toBe('my-shogi-project');
    expect(result?.authDomain).toBe('my-shogi-project.firebaseapp.com');
  });

  it('returns null for empty or invalid input', () => {
    expect(parseFirebaseConfigInput('')).toBeNull();
    expect(parseFirebaseConfigInput('hello world')).toBeNull();
    expect(parseFirebaseConfigInput(JSON.stringify({ otherKey: 'val' }))).toBeNull();
  });
});
