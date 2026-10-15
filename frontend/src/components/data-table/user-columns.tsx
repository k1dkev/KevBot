"use client";

import { User as UserIcon } from "lucide-react";
import { ColumnDef } from "@/components/ui/data-table";

export interface UserRow {
  id: number;
  name: string | null;
  created_at: string;
  relevance?: number | null;
}

export interface UserColumnsOptions {
  showJoined?: boolean;
  showRelevance?: boolean;
  trailingActionCell?: boolean;
}

function formatDateLocale(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function userColumns(opts: UserColumnsOptions = {}): ColumnDef<UserRow>[] {
  const { showJoined = true, showRelevance = false, trailingActionCell = false } = opts;

  const cols: ColumnDef<UserRow>[] = [];

  cols.push({
    id: "num",
    header: "#",
    className: "kb-cell-num",
    render: (_row, ctx) => ctx.index + 1,
  });

  cols.push({
    id: "art",
    header: "",
    className: "kb-cell-art",
    render: () => (
      <div className="kb-cell-art-inner">
        <UserIcon className="h-3 w-3" />
      </div>
    ),
  });

  cols.push({
    id: "name",
    header: "Name",
    className: "kb-cell-name",
    render: (row, ctx) => (
      <div className="kb-tr-info">
        <div className={`kb-tr-name${ctx.isSelected ? " kb-tr-current-name" : ""}`}>
          {row.name ?? `User #${row.id}`}
        </div>
      </div>
    ),
  });

  if (showJoined) {
    cols.push({
      id: "joined",
      header: "Joined",
      className: "kb-cell-meta",
      render: (row) => formatDateLocale(row.created_at),
    });
  }

  if (showRelevance) {
    cols.push({
      id: "relevance",
      header: "Relevance",
      className: "kb-cell-rel",
      render: (row) => (row.relevance != null ? row.relevance.toFixed(2) : "—"),
    });
  }

  if (trailingActionCell) {
    cols.push({
      id: "action",
      header: "",
      className: "kb-cell-action",
      render: () => null,
    });
  }

  return cols;
}
