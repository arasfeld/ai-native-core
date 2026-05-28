import { Picker } from "@react-native-picker/picker";
import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "../../hooks/use-theme-colors";
import { cn } from "../../utils/cn";
import * as haptics from "../../utils/haptics";
import { BottomSheet } from "../bottom-sheet";
import { Popover } from "../popover";
import { Text } from "../text";

function ChevronDown({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9l6 6 6-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Check({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12l5 5L20 7"
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  /** Optional secondary description rendered below the label in list rows. */
  description?: string;
  /** Optional dot color shown next to the label (e.g. for category swatches). */
  color?: string;
};

export type SelectPresentation = "sheet" | "popover";

export type SelectSize = "sm" | "md";

export type SelectProps<T extends string = string> = {
  value: T | null | undefined;
  onChange: (next: T) => void;
  options: readonly SelectOption<T>[];
  placeholder?: string;
  /** Optional title rendered at the top of the sheet (sheet presentation only). */
  title?: string;
  /**
   * How the option list is presented.
   *
   * - `sheet` (default) — bottom sheet. iOS uses a wheel picker with
   *   Cancel/Done; Android renders a scrollable list of rows.
   * - `popover` — floating panel anchored to the trigger. Single-tap
   *   selection on both platforms. Good for short option lists in dense UI.
   */
  presentation?: SelectPresentation;
  /**
   * Trigger height. `md` (default) matches inputs / pickers; `sm` is a
   * compact 36px row good for dense filter bars (Trips category/when).
   */
  size?: SelectSize;
  disabled?: boolean;
  className?: string;
  accessibilityLabel?: string;
};

// Per-size trigger styling. Padding + text size + chevron size travel
// together so the trigger always looks balanced.
const SIZE_CONFIG: Record<
  SelectSize,
  {
    trigger: string;
    text: "sm" | "base";
    chevron: number;
    dot: string;
  }
> = {
  sm: {
    trigger: "rounded-lg px-3 py-1.5",
    text: "sm",
    chevron: 16,
    dot: "h-2 w-2 rounded-full",
  },
  md: {
    trigger: "rounded-xl px-4 py-3",
    text: "base",
    chevron: 18,
    dot: "h-2.5 w-2.5 rounded-full",
  },
};

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Select",
  title,
  presentation = "sheet",
  size = "md",
  disabled,
  className,
  accessibilityLabel,
}: SelectProps<T>) {
  const sizeConfig = SIZE_CONFIG[size];
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<T | null>(value ?? null);
  const triggerRef = useRef<View>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const display = selected?.label ?? placeholder;
  // iOS native wheel picker can't render custom row content (Picker.Item only
  // accepts a string label). Fall back to the scrollable list whenever any
  // option carries a `color` so the swatches actually show.
  const hasColoredOptions = options.some((o) => o.color);
  const useWheelPicker =
    presentation === "sheet" && Platform.OS === "ios" && !hasColoredOptions;

  function openSheet() {
    if (disabled) return;
    setIosDraft(value ?? options[0]?.value ?? null);
    setOpen(true);
  }

  function confirmIos() {
    if (iosDraft != null) onChange(iosDraft);
    setOpen(false);
  }

  function pickRow(next: T) {
    haptics.selection();
    onChange(next);
    setOpen(false);
  }

  const trigger = (
    <Pressable
      ref={triggerRef}
      onPress={presentation === "popover" ? undefined : openSheet}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? placeholder}
      accessibilityState={{ disabled: !!disabled, expanded: open }}
      className={cn(
        "flex-row items-center justify-between border border-input bg-card active:opacity-80",
        sizeConfig.trigger,
        disabled && "opacity-50",
        className,
      )}
    >
      <View className="flex-1 flex-row items-center gap-2">
        {selected?.color ? (
          <View
            style={{ backgroundColor: selected.color }}
            className={sizeConfig.dot}
          />
        ) : null}
        <Text
          size={sizeConfig.text}
          tone={selected ? "default" : "muted"}
          numberOfLines={1}
        >
          {display}
        </Text>
      </View>
      <ChevronDown color={colors.mutedForeground} size={sizeConfig.chevron} />
    </Pressable>
  );

  if (presentation === "popover") {
    return (
      <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
        <Popover.Trigger>{trigger}</Popover.Trigger>
        <Popover.Content className="overflow-hidden" maxHeight={360}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => pickRow(opt.value)}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: isSelected }}
                  className={cn(
                    "flex-row items-center gap-3 px-4 py-3 active:bg-muted/40",
                    isSelected && "bg-primary-soft",
                  )}
                >
                  {opt.color ? (
                    <View
                      style={{ backgroundColor: opt.color }}
                      className="h-2.5 w-2.5 rounded-full"
                    />
                  ) : null}
                  <View className="flex-1">
                    <Text
                      size="sm"
                      weight={isSelected ? "semibold" : "regular"}
                      tone={isSelected ? "primary" : "default"}
                    >
                      {opt.label}
                    </Text>
                    {opt.description ? (
                      <Text size="xs" tone="muted">
                        {opt.description}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? (
                    <Check color={colors.primary} size={16} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Popover.Content>
      </Popover>
    );
  }

  return (
    <>
      {trigger}
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        // Wheel picker is a fixed-height native iOS picker (~200px) — `auto`
        // hugs it tightly. Scrollable list variant uses the default `large`
        // snap points so an overflowed list can scroll inside a bounded
        // BottomSheet.Content (the BottomSheet primitive disables over-drag
        // globally now, so no override needed here).
        size={useWheelPicker ? "auto" : undefined}
      >
        <BottomSheet.Content>
          <BottomSheet.Header>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={8}
              className="py-2"
            >
              <Text size="base" tone="muted">
                Cancel
              </Text>
            </Pressable>
            {title ? (
              <Text size="sm" weight="semibold" className="flex-1 text-center">
                {title}
              </Text>
            ) : null}
            {useWheelPicker ? (
              <Pressable onPress={confirmIos} hitSlop={8} className="py-2">
                <Text size="base" tone="primary" weight="semibold">
                  Done
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
          </BottomSheet.Header>

          {useWheelPicker ? (
            <Picker
              selectedValue={iosDraft ?? undefined}
              onValueChange={(next) => setIosDraft(next as T)}
              itemStyle={{ color: colors.foreground }}
            >
              {options.map((opt) => (
                <Picker.Item
                  key={opt.value}
                  label={opt.label}
                  value={opt.value}
                />
              ))}
            </Picker>
          ) : (
            <BottomSheet.ScrollView fill={false} style={{ maxHeight: 560 }}>
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => pickRow(opt.value)}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected: isSelected }}
                    className={cn(
                      "flex-row items-center gap-3 px-5 py-3.5 active:bg-muted/40",
                      isSelected && "bg-primary-soft",
                    )}
                  >
                    {opt.color ? (
                      <View
                        style={{ backgroundColor: opt.color }}
                        className="h-3 w-3 rounded-full"
                      />
                    ) : null}
                    <View className="flex-1">
                      <Text
                        size="base"
                        weight={isSelected ? "semibold" : "regular"}
                        tone={isSelected ? "primary" : "default"}
                      >
                        {opt.label}
                      </Text>
                      {opt.description ? (
                        <Text size="xs" tone="muted">
                          {opt.description}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Check color={colors.primary} size={18} />
                    ) : null}
                  </Pressable>
                );
              })}
            </BottomSheet.ScrollView>
          )}
        </BottomSheet.Content>
      </BottomSheet>
    </>
  );
}

Select.displayName = "Select";
