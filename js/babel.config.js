module.exports = (api) => {
  const isTest = api.env("test");
  return {
    presets: [
      [
        "@babel/preset-env",
        {
          targets: isTest ? { node: "current" } : undefined,
        },
      ],
      "@babel/preset-react",
      "@babel/preset-typescript",
    ],
    plugins: [
      "@babel/plugin-proposal-class-properties",
      ["@babel/transform-runtime"],
    ],
  };
};
