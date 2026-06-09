module.exports = {
  apps: [
    {
      name: "avgexpert-gateway",
      script: "npm.cmd",
      args: "start",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
