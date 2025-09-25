import * as React from "react";

export interface HeaderProps {
  title: string;
  logo: string;
  message: string;
}

const Header: React.FC<HeaderProps> = ({ title, logo, message }) => {
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-border/50 bg-card px-8 py-10 text-center shadow-sm">
      <img src={logo} alt={title} className="h-20 w-20 rounded-full border border-border/70 bg-background object-contain" />
      <h1 className="text-2xl font-semibold tracking-tight">{message}</h1>
      <p className="text-sm text-muted-foreground max-w-md">
        {title}
      </p>
    </section>
  );
};

export default Header;
