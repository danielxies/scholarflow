"use client";

import { useState, useMemo } from "react";
import { SearchIcon, LoaderIcon, PackageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Id, type ProjectSkill } from "@/lib/local-db/types";

import { SkillCard } from "./skill-card";
import { SkillDetailDialog } from "./skill-detail-dialog";
import { CategoryFilter } from "./category-filter";
import {
  useSkillsByCategory,
  useProjectSkills,
  useActivateSkill,
  useDeactivateSkill,
} from "../hooks/use-skills";

interface SkillsViewProps {
  projectId: Id<"projects">;
  isActive?: boolean;
}

export const SkillsView = ({ projectId, isActive = true }: SkillsViewProps) => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [detailSkillId, setDetailSkillId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { grouped, loading } = useSkillsByCategory();
  const projectSkills = useProjectSkills(isActive ? projectId : null) as ProjectSkill[] | undefined;
  const activate = useActivateSkill();
  const deactivate = useDeactivateSkill();

  const activeSkillIds = useMemo(
    () => new Set(projectSkills?.map((s) => s.skillId) ?? []),
    [projectSkills]
  );

  const categories = useMemo(
    () => Object.keys(grouped).sort(),
    [grouped]
  );

  const categoryNames = useMemo(
    () =>
      categories.map((key) => {
        const match = key.match(/^\d+-(.+)$/);
        return match
          ? match[1]
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ")
          : key;
      }),
    [categories]
  );

  const filteredSkills = useMemo(() => {
    let allSkills = Object.entries(grouped).flatMap(([, skills]) => skills);

    if (selectedCategory) {
      allSkills = grouped[selectedCategory] ?? [];
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      allSkills = allSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t: string) => t.toLowerCase().includes(q))
      );
    }

    return allSkills;
  }, [grouped, selectedCategory, search]);

  const handleToggle = async (skill: { id: string; name: string; category: string; categoryName: string }) => {
    if (activeSkillIds.has(skill.id)) {
      await deactivate({ projectId, skillId: skill.id });
    } else {
      await activate({
        projectId,
        skillId: skill.id,
        skillName: skill.name,
        category: skill.category,
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Research Skills</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeSkillIds.size} active &middot;{" "}
              {Object.values(grouped).flat().length} available
            </p>
          </div>
          <PackageIcon className="size-4 text-muted-foreground" />
        </div>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <CategoryFilter
          categories={categoryNames}
          selected={
            selectedCategory
              ? categoryNames[categories.indexOf(selectedCategory)] ?? null
              : null
          }
          onSelect={(name) => {
            if (!name) {
              setSelectedCategory(null);
            } else {
              const idx = categoryNames.indexOf(name);
              setSelectedCategory(idx >= 0 ? categories[idx] : null);
            }
          }}
        />
      </div>

      {/* Skills grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredSkills.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search ? "No skills match your search" : "No skills found"}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSkills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                isActive={activeSkillIds.has(skill.id)}
                onToggle={() => handleToggle(skill)}
                onClick={() => {
                  setDetailSkillId(skill.id);
                  setDetailOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <SkillDetailDialog
        skillId={detailSkillId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
};
