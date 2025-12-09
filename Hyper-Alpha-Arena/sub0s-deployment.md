# Deployment Guide for Hyper Alpha Arena

This guide provides instructions for deploying and running the Hyper Alpha Arena application, focusing on using **Podman** for containerization and **uv** for Python dependency management.

---

### Prerequisites

Before you begin, ensure you have the following tools installed on your system:

*   **Podman**: A daemonless container engine for developing, managing, and running OCI containers.
*   **podman-compose**: A tool to define and run multi-container applications with Podman (similar to Docker Compose).
*   **uv**: A fast Python package installer and resolver. Install it via `pip install uv`.
*   **Node.js & npm**: For managing and running the frontend application.

---

### Method 1: Hybrid Development Setup (Recommended for Local Development)

This method runs the database within a Podman container, while the backend (Python) and frontend (Node.js) are run directly on your host machine. This allows for easier code modifications and faster development cycles for the backend and frontend.

#### 1. Start the Database (using Podman Compose)

First, initiate only the PostgreSQL database service defined in your `docker-compose.yml` file. This isolates your database from your local system dependencies.

```bash
# Navigate to the project root directory if you're not already there
# cd /path/to/Hyper-Alpha-Arena

# Start only the PostgreSQL database in the background
podman compose up -d postgres
```

#### 2. Start the Backend (using uv)

Open a **new terminal tab or window** for the backend service. Here, we'll install Python dependencies using `uv` and start the FastAPI application.

```bash
# Navigate to the backend directory
cd backend

# Create a virtual environment and install all Python dependencies using uv
uv sync

# Set required environment variables for database connection and encryption key
# IMPORTANT: These environment variables must be set in every new terminal session
# where you run the backend manually.
export DATABASE_URL="postgresql://alpha_user:alpha_pass@localhost:5432/alpha_arena"
export SNAPSHOT_DATABASE_URL="postgresql://alpha_user:alpha_pass@localhost:5432/alpha_snapshots"
export HYPERLIQUID_ENCRYPTION_KEY=$(uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')

# Initialize the database schema (run this once or after database resets)
uv run python -m database.init_postgresql
uv run python database/init_hyperliquid_tables.py

# Start the FastAPI backend server in development mode (with hot-reloading)
# The application will listen on port 8802, consistent with the Docker setup.
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8802
```

#### 3. Start the Frontend (using npm)

Open a **third terminal tab or window** for the frontend application.

```bash
# Navigate to the frontend directory
cd frontend

# Install Node.js dependencies
npm install

# Start the React development server
npm run dev
```

**Accessing the Application (Hybrid Setup):**
Once all three services are running, open your web browser to the URL displayed in your frontend terminal (typically `http://localhost:5173`). The frontend will automatically connect to the backend running on `http://localhost:8802`.

---

### Method 2: Full Container Deployment (Production-like)

This method builds and runs both the backend and frontend services entirely within Podman containers, alongside the database. This is a more isolated and production-representative deployment, but local code changes for development won't be reflected immediately without rebuilding containers.

```bash
# Navigate to the project root directory if you're not already there
# cd /path/to/Hyper-Alpha-Arena

# Build and start all services defined in docker-compose.yml
podman compose up -d --build

# To view the logs of all running services
podman compose logs -f
```

**Accessing the Application (Full Container Setup):**
Open your web browser to `http://localhost:8802`.

---

### Post-Deployment Setup (First-Time Use)

After successfully starting the application (using either method), follow these steps to configure your AI traders:

1.  **Create an AI Trader**: In the web UI, navigate to the "AI Traders" section. Configure your preferred LLM provider (e.g., OpenAI, DeepSeek) and enter your API key.
2.  **Setup Hyperliquid Wallet**: Go to the "Hyperliquid Wallets" section. Enter your Hyperliquid private key for either the Testnet (risk-free simulation) or Mainnet (real trading).
3.  **Enable Auto Trading**: In your AI Trader's configuration, toggle "Auto Trading" to ON.

---

### Troubleshooting

*   **"Port already in use"**: If you encounter this, ensure no other processes are using ports `5432`, `8802`, or `5173`. For Podman, use `podman compose down` to stop all services.
*   **Database Connection Errors**:
    *   Verify the `postgres` container is running: `podman ps`.
    *   If running Method 1, ensure `DATABASE_URL` and `SNAPSHOT_DATABASE_URL` environment variables are correctly set in the backend terminal.
*   **Backend `uv` issues**: If `uv sync` or `uv run` commands don't work as expected, ensure `uv` is installed and updated (`pip install uv`). You might need to activate the virtual environment created by `uv` manually if `uv run` doesn't pick it up by default (e.g., `source .venv/bin/activate`).
*   **Frontend build errors**: If `npm install` or `npm run dev` fail, check the console output for specific errors related to Node.js versions or missing packages. Ensure you have Node.js 18 or later installed.
