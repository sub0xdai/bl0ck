import React from "react";
import { ArrowLeft } from "lucide-react";

interface DashboardPageLayoutProps {
  children: React.ReactNode;
  header: {
    title: string;
    description?: string;
  };
  onBack?: () => void;
}

export default function DashboardPageLayout({
  children,
  header,
  onBack,
}: DashboardPageLayoutProps) {
  return (
    <div className="flex flex-col relative w-full gap-1 min-h-full">
      <div className="flex items-center lg:items-baseline gap-2.5 md:gap-4 px-4 md:px-6 py-3 md:pb-4 lg:pt-7 ring-2 ring-pop sticky top-header-mobile lg:top-0 bg-background z-10">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center size-8 rounded-lg hover:bg-accent transition-colors mr-1"
            title="Back to Chat"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
        <h1 className="text-xl lg:text-4xl font-display leading-[1] mb-1">
          {header.title}
        </h1>
        {header.description && (
          <span className="ml-auto text-xs md:text-sm text-muted-foreground block uppercase">
            {header.description}
          </span>
        )}
      </div>
      <div className="min-h-full flex-1 flex flex-col gap-8 md:gap-14 px-3 lg:px-6 py-6 md:py-10 ring-2 ring-pop bg-background">
        {children}
      </div>
    </div>
  );
}
