"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { searchPlaces, type PlaceResult } from "@/lib/api/safety";
import { cn } from "@/components/ui/cn";

export function PlaceSearch({
  placeholder,
  onSelect,
  onClear,
  variant = "floating",
  icon,
  initialText = "",
  id = "place",
}: {
  placeholder: string;
  onSelect: (place: PlaceResult) => void;
  onClear?: () => void;
  /** floating = glass bar over the map; inline = field inside a panel. */
  variant?: "floating" | "inline";
  icon?: ReactNode;
  initialText?: string;
  id?: string;
}) {
  const [text, setText] = useState(initialText);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["places", query],
    queryFn: ({ signal }) => searchPlaces(query, signal),
    enabled: open && query.length >= 2,
    staleTime: 5 * 60_000,
  });

  const results = open && query.length >= 2 ? (data ?? []) : [];
  const listId = `${id}-results`;

  return (
    <div className="relative">
      <label
        className={cn(
          "flex items-center gap-2 px-4 transition-colors",
          variant === "floating"
            ? "h-12 rounded-2xl border border-line bg-glass shadow-soft backdrop-blur-xl focus-within:border-ink-3"
            : "h-11 rounded-xl border border-line bg-surface focus-within:border-accent",
        )}
      >
        {icon ?? <Search className="size-4 shrink-0 text-ink-3" aria-hidden />}
        <span className="sr-only">{placeholder}</span>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && results[0]) {
              onSelect(results[0]);
              setText(results[0].name);
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          // The label shows focus (border colour), so the input itself needs no outline.
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3 focus-visible:outline-none"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          autoComplete="off"
        />
        {isFetching && <Loader2 className="size-4 animate-spin text-ink-3" aria-hidden />}
        {text && !isFetching && (
          <button
            type="button"
            onClick={() => {
              setText("");
              onClear?.();
            }}
            className="text-ink-3 hover:text-ink"
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Clear</span>
          </button>
        )}
      </label>

      {(results.length > 0 || (open && isError)) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-soft"
        >
          {isError && <li className="px-4 py-3 text-sm text-ink-3">Search unavailable</li>}
          {results.map((place) => (
            <li key={place.id} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => {
                  onSelect(place);
                  setText(place.name);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-surface-2"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{place.name}</span>
                  {place.context && <span className="block truncate text-xs text-ink-3">{place.context}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
