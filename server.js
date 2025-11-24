// server.js
const path = require("path");
const appModule = require(path.join(__dirname, "dist", "app.js"));
const app = appModule.default || appModule; // support both default export or module.exports

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
