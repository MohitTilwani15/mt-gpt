import * as React from "react";

export interface HeroListItem {
  icon: React.ReactNode;
  primaryText: string;
  secondaryText?: string;
}

export interface HeroListProps {
  message: string;
  items: HeroListItem[];
}

const HeroList: React.FC<HeroListProps> = ({ message, items }) => {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border/50 bg-muted/20 p-6">
      <h2 className="text-lg font-semibold text-foreground">{message}</h2>
      <ul className="space-y-4">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-4 rounded-xl border border-border/40 bg-background px-4 py-3 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              {item.icon}
            </div>
            <div>
              <p className="text-base font-medium text-foreground">{item.primaryText}</p>
              {item.secondaryText && <p className="text-sm text-muted-foreground">{item.secondaryText}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HeroList;
