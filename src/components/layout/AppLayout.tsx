import React from 'react';
import Header from './Header';
import Footer from './Footer';

interface AppLayoutProps {
  children: React.ReactNode;
  currentOpening?: string;
  onSelectOpening?: () => void;
  onOpenKifuManager?: () => void;
  gameCount?: number;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  currentOpening,
  onSelectOpening,
  onOpenKifuManager,
  gameCount,
}) => {
  return (
    <div className="flex min-h-screen flex-col bg-shogi-bg text-slate-100">
      <Header
        currentOpening={currentOpening}
        onSelectOpening={onSelectOpening}
        onOpenKifuManager={onOpenKifuManager}
        gameCount={gameCount}
      />
      <main className="mx-auto flex-1 w-full max-w-7xl px-2 sm:px-6 py-3 sm:py-6 pb-20 sm:pb-8">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default AppLayout;
