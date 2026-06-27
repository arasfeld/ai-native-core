module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Required by react-native-reanimated v4 (used throughout @repo/ui-native:
    // pressable-feedback, segmented-control, etc.). In Reanimated 4 the worklet
    // transform moved out to react-native-worklets, so the plugin is now
    // "react-native-worklets/plugin". Must be listed last. Without it, worklet
    // APIs throw "Exception in HostFunction" at load and crash every route.
    plugins: ["react-native-worklets/plugin"],
  };
};
