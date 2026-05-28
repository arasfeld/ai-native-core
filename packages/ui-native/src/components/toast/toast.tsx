import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Pressable, View } from "react-native";
import { cn } from "../../utils/cn";
import * as haptics from "../../utils/haptics";
import { Text } from "../text";
import {
  type ToastVariant,
  toastDescription,
  toastRoot,
  toastTitle,
  toastViewport,
} from "./toast.styles";

export type ToastOptions = {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss after this many ms. Default 4000. Set 0 to keep open. */
  duration?: number;
  /** Optional unique id; auto-generated when omitted. Pass to update an existing toast. */
  id?: string;
};

type ToastItem = Required<Pick<ToastOptions, "id" | "variant" | "duration">> & {
  title?: string;
  description?: string;
};

type ToastContextValue = {
  toast: (options: ToastOptions) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

let toastIdCounter = 0;
function makeId() {
  toastIdCounter += 1;
  return `toast-${Date.now()}-${toastIdCounter}`;
}

export type ToastProviderProps = {
  children: ReactNode;
  /** Default auto-dismiss duration. Default 4000ms. */
  defaultDuration?: number;
};

export function ToastProvider(props: ToastProviderProps) {
  const { children, defaultDuration = 4000 } = props;
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    },
    [clearTimer],
  );

  const dismissAll = useCallback(() => {
    timers.current.forEach((t) => {
      clearTimeout(t);
    });
    timers.current.clear();
    setItems([]);
  }, []);

  const scheduleDismiss = useCallback(
    (id: string, duration: number) => {
      if (duration <= 0) return;
      clearTimer(id);
      const handle = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, handle);
    },
    [clearTimer, dismiss],
  );

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = options.id ?? makeId();
      const variant = options.variant ?? "default";
      const item: ToastItem = {
        id,
        title: options.title,
        description: options.description,
        variant,
        duration: options.duration ?? defaultDuration,
      };
      setItems((prev) => {
        const existing = prev.findIndex((p) => p.id === id);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = item;
          return next;
        }
        return [...prev, item];
      });
      scheduleDismiss(id, item.duration);
      if (variant === "success") haptics.success();
      else if (variant === "error") haptics.error();
      return id;
    },
    [defaultDuration, scheduleDismiss],
  );

  const success = useCallback(
    (title: string, description?: string) =>
      toast({ title, description, variant: "success" }),
    [toast],
  );
  const error = useCallback(
    (title: string, description?: string) =>
      toast({ title, description, variant: "error" }),
    [toast],
  );
  const info = useCallback(
    (title: string, description?: string) =>
      toast({ title, description, variant: "info" }),
    [toast],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => {
        clearTimeout(t);
      });
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toast, success, error, info, dismiss, dismissAll }),
    [toast, success, error, info, dismiss, dismissAll],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

ToastProvider.displayName = "ToastProvider";

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <View pointerEvents="box-none" className={cn(toastViewport())}>
      {items.map((item) => (
        <ToastView key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

function ToastView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Pressable
        onPress={() => onDismiss(item.id)}
        accessibilityRole="alert"
        accessibilityLabel={item.title ?? item.description ?? "Notification"}
        className={cn(toastRoot({ variant: item.variant }))}
      >
        <View className="flex-1 gap-0.5">
          {item.title ? (
            <Text
              weight="semibold"
              className={cn(toastTitle({ variant: item.variant }))}
            >
              {item.title}
            </Text>
          ) : null}
          {item.description ? (
            <Text
              size="sm"
              className={cn(toastDescription({ variant: item.variant }))}
            >
              {item.description}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
