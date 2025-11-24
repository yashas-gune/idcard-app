"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const agents_1 = __importDefault(require("./routes/agents"));
const organization_1 = __importDefault(require("./routes/organization"));
const templates_1 = __importDefault(require("./routes/templates"));
const idCards_1 = __importDefault(require("./routes/idCards"));
const upload_1 = __importDefault(require("./routes/upload"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/uploads', express_1.default.static('uploads'));
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/users', users_1.default);
app.use('/api/agents', agents_1.default);
app.use('/api/organizations', organization_1.default);
app.use('/api/templates', templates_1.default);
app.use('/api/id-cards', idCards_1.default);
app.use('/api/upload', upload_1.default);
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'ID Card Management API is running',
        timestamp: new Date().toISOString()
    });
});
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
