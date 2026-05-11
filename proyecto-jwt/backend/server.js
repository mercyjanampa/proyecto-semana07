import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Sequelize, DataTypes } from 'sequelize';

const app = express();
// Esto permite que cualquier aplicación se conecte a tu API
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());

const SECRET = 'mi-secreto-2026';
const ACCESS_TOKEN_EXPIRY = 60; // 60 segundos para la demostración

// Configuración para que funcione en Render sin MySQL
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite', // Se creará un archivo automático
    logging: false
});

// MODELOS
const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true },
    email: { type: DataTypes.STRING, unique: true },
    password: { type: DataTypes.STRING }
});

const Role = sequelize.define('Role', { name: { type: DataTypes.STRING, unique: true } });

const RefreshToken = sequelize.define('RefreshToken', {
    token: { type: DataTypes.TEXT },
    expiresAt: { type: DataTypes.DATE }
});

// RELACIONES (Muchos a Muchos para Roles)
User.belongsToMany(Role, { through: 'user_roles' });
Role.belongsToMany(User, { through: 'user_roles' });
User.hasMany(RefreshToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'userId' });

// ENDPOINTS
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { username, email, password, roles } = req.body;
        const hash = bcrypt.hashSync(password, 10);
        const user = await User.create({ username, email, password: hash });

        // Asignar roles (si no envía, por defecto es 'user')
        const rolesToAssign = roles && roles.length > 0 ? roles : ['user'];
        const dbRoles = await Role.findAll({ where: { name: rolesToAssign } });
        await user.setRoles(dbRoles);

        res.json({ message: 'Registrado con éxito' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/auth/signin', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username }, include: Role });

    if (!user || !bcrypt.compareSync(password, user.password))
        return res.status(401).json({ message: 'Datos incorrectos' });

    const accessToken = jwt.sign({ id: user.id }, SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = jwt.sign({ id: user.id }, SECRET, { expiresIn: '7d' });

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);
    await RefreshToken.create({ token: refreshToken, expiresAt: expiryDate, userId: user.id });

    res.json({
        username: user.username, email: user.email,
        roles: user.Roles.map(r => r.name),
        accessToken, refreshToken
    });
});

app.post('/api/auth/refreshtoken', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(403).send("Token requerido");

    const stored = await RefreshToken.findOne({ where: { token: refreshToken } });
    if (!stored || new Date() > stored.expiresAt) return res.status(403).send("Expirado");

    try {
        const decoded = jwt.verify(refreshToken, SECRET);
        const newAccess = jwt.sign({ id: decoded.id }, SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
        res.json({ accessToken: newAccess });
    } catch (e) { res.status(403).send("Error"); }
});

app.post('/api/auth/signout', async (req, res) => {
    await RefreshToken.destroy({ where: { token: req.body.refreshToken } });
    res.json({ message: 'Sesión cerrada en DB' });
});

// INICIO
(async () => {
    await sequelize.sync({ force: true });
    await Role.bulkCreate([{ name: 'user' }, { name: 'moderator' }, { name: 'admin' }]);
    const PORT = process.env.PORT || 10000;
    app.listen(PORT, () => console.log(`Backend en puerto ${PORT}`));
})();
