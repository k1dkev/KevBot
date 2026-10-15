"use client";

import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface RowContext {
  index: number;
  isHovered: boolean;
  isCurrent: boolean;
  isSelected: boolean;
}

export interface ColumnDef<T> {
  id: string;
  header: ReactNode;
  className?: string;
  render: (row: T, ctx: RowContext) => ReactNode;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: ColumnDef<T>[];
  getRowKey: (row: T, index: number) => string | number;
  rowState?: (row: T) => { current?: boolean; selected?: boolean };
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  variant?: "default" | "condensed";
  stickyHead?: boolean;
  emptyState?: ReactNode;
  footer?: ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  rowState,
  onRowClick,
  onRowDoubleClick,
  variant = "default",
  stickyHead = false,
  emptyState,
  footer,
}: DataTableProps<T>) {
  const [hoveredKey, setHoveredKey] = useState<string | number | null>(null);

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <>
      <div
        className={cn(
          "kb-table",
          variant === "condensed" && "kb-table-condensed",
          stickyHead && "kb-table-sticky-head",
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.id} scope="col" className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const key = getRowKey(row, index);
              const state = rowState?.(row) ?? {};
              const isCurrent = !!state.current;
              const isSelected = !!state.selected;
              const isHovered = hoveredKey === key;
              const ctx: RowContext = { index, isHovered, isCurrent, isSelected };

              const rowClassName = isCurrent ? "kb-row-current" : isSelected ? "kb-row-selected" : undefined;

              return (
                <TableRow
                  key={key}
                  className={cn("group", rowClassName)}
                  tabIndex={onRowClick || onRowDoubleClick ? 0 : undefined}
                  aria-current={isCurrent ? "true" : undefined}
                  aria-keyshortcuts={onRowClick || onRowDoubleClick ? "Enter Space" : undefined}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey((prev) => (prev === key ? null : prev))}
                  onClick={
                    onRowClick
                      ? (event) => {
                          if (
                            !(event.target as HTMLElement).closest(
                              "a, button, input, select, textarea, [role='button']",
                            )
                          ) {
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  onDoubleClick={
                    onRowDoubleClick
                      ? (event) => {
                          if (
                            !(event.target as HTMLElement).closest(
                              "a, button, input, select, textarea, [role='button']",
                            )
                          ) {
                            onRowDoubleClick(row);
                          }
                        }
                      : undefined
                  }
                  onKeyDown={(event) => {
                    const activate = onRowClick ?? onRowDoubleClick;
                    // Nested links, buttons and inputs keep their native keyboard behavior.
                    if (!activate || event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (!event.repeat) activate(row);
                    }
                  }}
                  style={onRowClick ? { cursor: "pointer" } : undefined}
                >
                  {columns.map((col) => (
                    <TableCell key={col.id} className={col.className}>
                      {col.render(row, ctx)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {footer}
    </>
  );
}
