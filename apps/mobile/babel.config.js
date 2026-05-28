module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Required by react-native-reanimated (used throughout @repo/ui-native:
    // pressable-feedback, segmented-control, etc.). Must be listed last.
    // Without it, importing reanimated's worklet APIs throws "Exception in
    // HostFunction" at load and crashes every route.
    plugins: ["react-native-reanimated/plugin"],
  };
};
