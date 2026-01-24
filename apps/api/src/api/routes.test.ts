import { describe, expect, mock, test } from "bun:test";
import { api } from "./routes";

// Chainable query builder mock
const mockQueryChain = {
	ilike: mock(() => mockQueryChain),
	in: mock(() => mockQueryChain),
	eq: mock(() => mockQueryChain),
	gte: mock(() => mockQueryChain),
	lte: mock(() => mockQueryChain),
	order: mock(() => mockQueryChain),
	limit: mock(() => mockQueryChain),
	then: (onfulfilled: any) =>
		Promise.resolve({ data: [], error: null }).then(onfulfilled),
} as any;

mock.module("../lib/supabase", () => {
	return {
		default: {
			from: mock(() => ({
				select: mock(() => mockQueryChain),
			})),
		},
	};
});

describe("API Routes", () => {
	test("GET /api/opinion returns 200", async () => {
		const res = await api.request("/opinion");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	test("GET /api/rancho_previsoes returns 200", async () => {
		const res = await api.request("/rancho_previsoes");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	test("GET /api/wherewhowhen returns 200", async () => {
		const res = await api.request("/wherewhowhen");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	test("GET /api/user-military-data returns 200", async () => {
		const res = await api.request("/user-military-data");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	test("GET /api/user-data returns 200", async () => {
		const res = await api.request("/user-data");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	test("GET /api/units returns 200", async () => {
		const res = await api.request("/units");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	test("GET /api/mess-halls returns 200", async () => {
		const res = await api.request("/mess-halls");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});
});
