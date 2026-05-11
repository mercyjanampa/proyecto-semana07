import React, { useState, useEffect, createContext, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export default function App() {
    const [user, setUser] = useState(null);
    const [accessToken, setAccessToken] = useState(null); // REQUISITO: TOKEN EN MEMORIA
    const [page, setPage] = useState('home');

    // Instancia Axios con interceptor
    const api = axios.create({ baseURL: 'http://localhost:8080/api' });

    api.interceptors.request.use(config => {
        if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
        return config;
    });

    api.interceptors.response.use(r => r, async error => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                const rf = localStorage.getItem('refreshToken');
                const res = await axios.post('http://localhost:8080/api/auth/refreshtoken', { refreshToken: rf });
                setAccessToken(res.data.accessToken); // Actualiza la memoria
                originalRequest.headers.Authorization = `Bearer ${res.data.accessToken}`;
                return axios(originalRequest);
            } catch (e) { logout(); }
        }
        return Promise.reject(error);
    });

    useEffect(() => {
        const u = localStorage.getItem('user');
        if (u) setUser(JSON.parse(u));
    }, []);

    const login = async (username, password) => {
        const res = await axios.post('http://localhost:8080/api/auth/signin', { username, password });
        setAccessToken(res.data.accessToken); // Guardar en memoria
        localStorage.setItem('refreshToken', res.data.refreshToken); // LocalStorage
        localStorage.setItem('user', JSON.stringify({ username: res.data.username, roles: res.data.roles }));
        setUser(res.data);
        setPage('profile');
    };

    const logout = async () => {
        const rf = localStorage.getItem('refreshToken');
        if (rf) await axios.post('http://localhost:8080/api/auth/signout', { refreshToken: rf });
        localStorage.clear();
        setAccessToken(null); // Limpiar memoria
        setUser(null);
        setPage('home');
    };

    return (
        <AuthContext.Provider value={{ user, accessToken, login, logout, setPage, api }}>
            <Navbar />
            <div style={styles.main}>
                {page === 'home' && <Home />}
                {page === 'login' && <Login />}
                {page === 'register' && <Register />}
                {page === 'profile' && <Profile />}
                {['user', 'moderator', 'admin'].includes(page) && <Board type={page} />}
            </div>
        </AuthContext.Provider>
    );
}

// BARRA DE NAVEGACIÓN DINÁMICA
function Navbar() {
    const { user, logout, setPage } = useContext(AuthContext);
    const roles = user?.roles || [];

    return (
        <nav style={styles.nav}>
            <span onClick={() => setPage('home')} style={styles.brand}>SISTEMA JWT</span>
            <div>
                {!user ? (
                    <>
                        <button onClick={() => setPage('login')}>Entrar</button>
                        <button onClick={() => setPage('register')}>Registro</button>
                    </>
                ) : (
                    <>
                        <button onClick={() => setPage('profile')}>Mi Perfil</button>
                        {/* ROLES DINÁMICOS */}
                        <button onClick={() => setPage('user')}>Pestaña Usuario</button>
                        {roles.includes('moderator') && <button onClick={() => setPage('moderator')} style={styles.modBtn}>Moderación</button>}
                        {roles.includes('admin') && <button onClick={() => setPage('admin')} style={styles.adminBtn}>Panel Admin</button>}
                        <button onClick={logout} style={styles.logoutBtn}>Cerrar Sesión</button>
                    </>
                )}
            </div>
        </nav>
    );
}

// FORMULARIOS CON VALIDACIÓN FRONT-END
function Login() {
    const { login } = useContext(AuthContext);
    const [form, setForm] = useState({ username: '', password: '' });

    const handleSubmit = (e) => {
        e.preventDefault();
        // VALIDACIÓN
        if (!form.username || !form.password) return alert("Completa todos los campos");
        login(form.username, form.password).catch(() => alert("Error de acceso"));
    };

    return (
        <form onSubmit={handleSubmit} style={styles.card}>
            <h3>Login</h3>
            <input placeholder="Usuario" onChange={e => setForm({ ...form, username: e.target.value })} style={styles.input} />
            <input type="password" placeholder="Password" onChange={e => setForm({ ...form, password: e.target.value })} style={styles.input} />
            <button type="submit" style={styles.btn}>Ingresar</button>
        </form>
    );
}

function Register() {
    const { setPage } = useContext(AuthContext);
    const [form, setForm] = useState({ username: '', email: '', password: '', role: 'user' });

    const handleRegister = async (e) => {
        e.preventDefault();
        // VALIDACIONES FRONT-END
        if (form.username.length < 3) return alert("Usuario muy corto");
        if (!form.email.includes('@')) return alert("Email inválido");
        if (form.password.length < 5) return alert("Password mínimo 5 caracteres");

        await axios.post('http://localhost:8080/api/auth/signup', { ...form, roles: [form.role] });
        alert("¡Creado!"); setPage('login');
    };

    return (
        <form onSubmit={handleRegister} style={styles.card}>
            <h3>Registro</h3>
            <input placeholder="Usuario" onChange={e => setForm({ ...form, username: e.target.value })} style={styles.input} />
            <input placeholder="Email" onChange={e => setForm({ ...form, email: e.target.value })} style={styles.input} />
            <input type="password" placeholder="Password" onChange={e => setForm({ ...form, password: e.target.value })} style={styles.input} />
            <select onChange={e => setForm({ ...form, role: e.target.value })} style={styles.input}>
                <option value="user">Usuario</option>
                <option value="moderator">Moderador</option>
                <option value="admin">Administrador</option>
            </select>
            <button type="submit" style={styles.btn}>Registrar</button>
        </form>
    );
}

function Profile() {
    const { user, accessToken } = useContext(AuthContext);
    return (
        <div style={styles.card}>
            <h2>Hola, {user?.username}</h2>
            <p>Tus roles: {user?.roles.join(', ')}</p>
            <div style={{ fontSize: '9px', wordBreak: 'break-all', color: 'blue' }}>
                <b>Token en Memoria (State):</b><br />{accessToken}
            </div>
        </div>
    );
}

function Board({ type }) { return <div style={styles.card}><h1>Panel de {type.toUpperCase()}</h1><p>Contenido privado...</p></div>; }
function Home() { return <div style={styles.card}><h1>Inicio</h1><p>Esperar 60s para ver el Refresh Token en acción.</p></div>; }

const styles = {
    nav: { display: 'flex', justifyContent: 'space-between', padding: '15px', background: '#333', color: 'white', alignItems: 'center' },
    brand: { fontWeight: 'bold', fontSize: '20px', cursor: 'pointer' },
    main: { display: 'flex', justifyContent: 'center', padding: '40px' },
    card: { border: '1px solid #ddd', padding: '30px', borderRadius: '10px', width: '400px', textAlign: 'center', background: 'white' },
    input: { width: '90%', padding: '10px', margin: '10px 0' },
    btn: { width: '95%', padding: '10px', background: 'green', color: 'white', border: 'none', cursor: 'pointer' },
    modBtn: { background: 'orange', marginLeft: '5px' },
    adminBtn: { background: 'red', marginLeft: '5px' },
    logoutBtn: { background: '#555', marginLeft: '10px' }
};
