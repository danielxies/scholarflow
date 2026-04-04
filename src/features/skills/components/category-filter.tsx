"use client";

import { cn } from "@/lib/utils";

interface CategoryFilterProps {
  categories: string[];
  selected: string | null;
  onSelect: (category: string | null) => void;
}

export const CategoryFilter = ({
  categories,
  selected,
  onSelect,
}: CategoryFilterProps) => {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
          selected === null
            ? "bg-foreground text-background border-foreground"
            : "bg-transparent text-muted-foreground border-border hover:border-foreground/50"
        )}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat === selected ? null : cat)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
            cat === selected
              ? "bg-foreground text-background border-foreground"
              : "bg-transparent text-muted-foreground border-border hover:border-foreground/50"
          )}
        >
          {cat}
        </button>
      ))}
    </div>
  );
};
