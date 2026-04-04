"use client";

import { CheckIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SkillCardProps {
  skill: {
    id: string;
    name: string;
    description: string;
    tags: string[];
    categoryName: string;
  };
  isActive: boolean;
  onToggle: () => void;
  onClick: () => void;
}

export const SkillCard = ({
  skill,
  isActive,
  onToggle,
  onClick,
}: SkillCardProps) => {
  return (
    <div className="group rounded-lg border bg-card p-4 hover:border-foreground/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onClick} className="text-left flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate">{skill.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {skill.categoryName}
          </p>
        </button>
        <Button
          size="icon-xs"
          variant={isActive ? "default" : "outline"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="shrink-0"
        >
          {isActive ? (
            <CheckIcon className="size-3" />
          ) : (
            <PlusIcon className="size-3" />
          )}
        </Button>
      </div>
      <button onClick={onClick} className="text-left w-full">
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
          {skill.description}
        </p>
        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {skill.tags.slice(0, 4).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {tag}
              </Badge>
            ))}
            {skill.tags.length > 4 && (
              <span className="text-[10px] text-muted-foreground">
                +{skill.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  );
};
