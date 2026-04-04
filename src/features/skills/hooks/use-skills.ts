"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocalQuery, useLocalMutation } from "@/lib/local-db/hooks";
import type { Id } from "@/lib/local-db/types";

interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
  tags: string[];
  dependencies: string[];
  category: string;
  categoryNumber: number;
  categoryName: string;
  contentPath: string;
}

interface SkillContent extends SkillMetadata {
  content: string;
  references: string[];
}

export function useAllSkills() {
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/skills")
      .then((res) => res.json())
      .then((data) => setSkills(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { skills, loading };
}

export function useSkillsByCategory() {
  const [grouped, setGrouped] = useState<Record<string, SkillMetadata[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/skills?grouped=true")
      .then((res) => res.json())
      .then((data) => setGrouped(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { grouped, loading };
}

export function useSkillSearch(query: string) {
  const [results, setResults] = useState<SkillMetadata[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    fetch(`/api/skills?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => setResults(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [query]);

  return { results, loading };
}

export function useSkillContent(skillId: string | null) {
  const [skill, setSkill] = useState<SkillContent | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!skillId) {
      setSkill(null);
      return;
    }
    setLoading(true);
    fetch(`/api/skills/${encodeURIComponent(skillId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSkill(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [skillId]);

  return { skill, loading };
}

export function useProjectSkills(projectId: Id<"projects"> | null) {
  return useLocalQuery("projectSkills.get", projectId ? { projectId } : "skip");
}

export function useActivateSkill() {
  return useLocalMutation("projectSkills.activate");
}

export function useDeactivateSkill() {
  return useLocalMutation("projectSkills.deactivate");
}
