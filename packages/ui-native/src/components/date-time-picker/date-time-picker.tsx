import RNDateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, Text } from "react-native";
import { BottomSheet } from "../bottom-sheet";

export type DateTimePickerMode = "date" | "time" | "datetime";

export type DateTimePickerProps = {
  value: Date | null;
  onChange: (date: Date) => void;
  mode?: DateTimePickerMode;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
  className?: string;
  accessibilityLabel?: string;
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};
const DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  ...DATE_FORMAT,
  ...TIME_FORMAT,
};

function formatValue(value: Date | null, mode: DateTimePickerMode): string {
  if (!value) return "";
  const opts =
    mode === "time"
      ? TIME_FORMAT
      : mode === "datetime"
        ? DATETIME_FORMAT
        : DATE_FORMAT;
  return value.toLocaleString(undefined, opts);
}

export function DateTimePicker({
  value,
  onChange,
  mode = "date",
  placeholder = "Select",
  minimumDate,
  maximumDate,
  disabled,
  className,
  accessibilityLabel,
}: DateTimePickerProps) {
  const [iosOpen, setIosOpen] = useState(false);
  // Holds the in-flight selection while the iOS sheet is open so the user can
  // scroll through dates without committing on every spin.
  const [iosDraft, setIosDraft] = useState<Date | null>(null);

  function openAndroid() {
    const initial = value ?? new Date();
    if (mode === "datetime") {
      DateTimePickerAndroid.open({
        value: initial,
        mode: "date",
        minimumDate,
        maximumDate,
        onChange: (event: DateTimePickerEvent, picked?: Date) => {
          if (event.type !== "set" || !picked) return;
          DateTimePickerAndroid.open({
            value: picked,
            mode: "time",
            onChange: (timeEvent: DateTimePickerEvent, time?: Date) => {
              if (timeEvent.type !== "set" || !time) return;
              const combined = new Date(picked);
              combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
              onChange(combined);
            },
          });
        },
      });
      return;
    }
    DateTimePickerAndroid.open({
      value: initial,
      mode,
      minimumDate,
      maximumDate,
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type !== "set" || !picked) return;
        onChange(picked);
      },
    });
  }

  function handlePress() {
    if (disabled) return;
    if (Platform.OS === "android") {
      openAndroid();
      return;
    }
    setIosDraft(value ?? new Date());
    setIosOpen(true);
  }

  function confirmIos() {
    if (iosDraft) onChange(iosDraft);
    setIosOpen(false);
  }

  const display = value ? formatValue(value, mode) : placeholder;

  return (
    <>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? placeholder}
        className={
          className ??
          "rounded-xl border border-input bg-card px-4 py-3 active:opacity-80 disabled:opacity-50"
        }
      >
        <Text
          className={
            value
              ? "text-base text-card-foreground"
              : "text-base text-muted-foreground"
          }
        >
          {display}
        </Text>
      </Pressable>

      {Platform.OS === "ios" ? (
        <BottomSheet open={iosOpen} onOpenChange={setIosOpen} size="auto">
          <BottomSheet.Content>
            <BottomSheet.Header>
              <Pressable onPress={() => setIosOpen(false)} className="py-2">
                <Text className="text-base text-muted-foreground">Cancel</Text>
              </Pressable>
              <Pressable onPress={confirmIos} className="py-2">
                <Text
                  className="text-base text-primary"
                  style={{ fontFamily: "Inter-SemiBold" }}
                >
                  Done
                </Text>
              </Pressable>
            </BottomSheet.Header>
            <RNDateTimePicker
              value={iosDraft ?? value ?? new Date()}
              mode={mode}
              display="spinner"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onChange={(_event, picked) => {
                if (picked) setIosDraft(picked);
              }}
              style={{ alignSelf: "center" }}
            />
          </BottomSheet.Content>
        </BottomSheet>
      ) : null}
    </>
  );
}
