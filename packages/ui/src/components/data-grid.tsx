"use client";

import {
  AllCommunityModule,
  type ColDef,
  type GridOptions,
  type Theme,
  themeQuartz,
} from "ag-grid-community";
import { AgGridProvider, AgGridReact } from "ag-grid-react";

export const aiNativeCoreGridTheme = themeQuartz.withParams({
  accentColor: "var(--primary)",
  backgroundColor: "var(--background)",
  foregroundColor: "var(--foreground)",
  borderColor: "var(--border)",
  borderWidth: 1,
  browserColorScheme: "inherit",
  chromeBackgroundColor: "var(--card)",
  headerBackgroundColor: "var(--muted)",
  headerTextColor: "var(--foreground)",
  headerFontWeight: 600,
  headerFontSize: 12,
  cellTextColor: "var(--foreground)",
  textColor: "var(--foreground)",
  subtleTextColor: "var(--muted-foreground)",
  dataFontSize: 14,
  fontFamily: [
    "var(--font-sans)",
    "ui-sans-serif",
    "system-ui",
    "sans-serif",
    "Apple Color Emoji",
    "Segoe UI Emoji",
  ],
  spacing: 8,
  rowHoverColor: "color-mix(in oklch, var(--muted) 50%, transparent)",
  oddRowBackgroundColor:
    "color-mix(in oklch, var(--muted) 12%, var(--background))",
  selectedRowBackgroundColor:
    "color-mix(in oklch, var(--primary) 14%, var(--background))",
});

const modules = [AllCommunityModule];

export type DataGridProps<TData = unknown> = Omit<
  GridOptions<TData>,
  "rowData" | "columnDefs" | "theme"
> & {
  rowData: TData[] | null | undefined;
  columnDefs: ColDef<TData>[];
  theme?: Theme;
  className?: string;
  height?: number | string;
};

export function DataGrid<TData = unknown>({
  rowData,
  columnDefs,
  theme = aiNativeCoreGridTheme,
  className,
  height = 480,
  defaultColDef,
  pagination = true,
  paginationPageSize = 25,
  paginationPageSizeSelector = [10, 25, 50, 100],
  ...gridOptions
}: DataGridProps<TData>) {
  return (
    <AgGridProvider modules={modules}>
      <div className={className} style={{ height }}>
        <AgGridReact<TData>
          theme={theme}
          rowData={rowData ?? []}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef ?? { sortable: true, resizable: true }}
          pagination={pagination}
          paginationPageSize={paginationPageSize}
          paginationPageSizeSelector={paginationPageSizeSelector}
          {...gridOptions}
        />
      </div>
    </AgGridProvider>
  );
}
