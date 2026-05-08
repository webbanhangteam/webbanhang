module.exports = {
  apps: [
    {
      name: 'shop-anh-thuan',
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: process.env.PORT || 3000
      }
    }
  ]
};
