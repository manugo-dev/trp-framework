export interface TRPConfig {
	db?: {
		mysql?: {
			host?: string;
			port?: number;
			database?: string;
			user?: string;
			password?: string;
			poolLimit?: number;
		};
	};
	redis?: {
		host?: string;
		port?: number;
		password?: string;
		db?: number;
	};
	logger?: {
		level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
		pretty?: boolean;
	};
	modules?: Record<string, unknown>;
}
