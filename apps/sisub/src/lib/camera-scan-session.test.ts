/**
 * Unit — sessão de leitura pela câmera.
 *
 * O caso que importa é o do mundo real: a pessoa abre a leitura, o navegador pergunta pela
 * permissão e ela fecha o diálogo antes de responder. A câmera não pode ficar ligada depois.
 */

import { describe, expect, test, vi } from "vitest"
import {
	CAMERA_UNAVAILABLE_MESSAGE,
	CAMERA_UNSUPPORTED_MESSAGE,
	type CameraScanCallbacks,
	type CameraScanEnvironment,
	type NativeDetectorLike,
	startCameraScan,
} from "@/lib/camera-scan-session"

function createDeferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

/** Deixa as promessas pendentes andarem (várias voltas: a sessão encadeia `await`s). */
async function flushPromises() {
	for (let i = 0; i < 10; i++) await Promise.resolve()
}

function createStream() {
	const track = { stop: vi.fn() }
	return { track, stream: { getTracks: () => [track] } }
}

function createCallbacks() {
	return {
		onScan: vi.fn<CameraScanCallbacks["onScan"]>(),
		onScanning: vi.fn<CameraScanCallbacks["onScanning"]>(),
		onError: vi.fn<CameraScanCallbacks["onError"]>(),
	}
}

function createEnvironment(overrides: Partial<CameraScanEnvironment> = {}): CameraScanEnvironment {
	return {
		openCamera: async () => createStream().stream,
		playStream: async () => {},
		createNativeDetector: () => null,
		loadZxingReader: async () => ({ decode: async () => ({ stop: () => {} }) }),
		requestFrame: () => 1,
		cancelFrame: () => {},
		...overrides,
	}
}

describe("startCameraScan", () => {
	test("fechar com o pedido de permissão aberto desliga a câmera que chega depois", async () => {
		const camera = createDeferred<ReturnType<typeof createStream>["stream"]>()
		const { track, stream } = createStream()
		const callbacks = createCallbacks()
		const stop = startCameraScan(createEnvironment({ openCamera: () => camera.promise }), callbacks)

		stop()
		camera.resolve(stream)
		await flushPromises()

		expect(track.stop).toHaveBeenCalledTimes(1)
		expect(callbacks.onScanning).not.toHaveBeenCalled()
		expect(callbacks.onError).not.toHaveBeenCalled()
	})

	test("fechar enquanto o zxing abre para os controles que chegam depois", async () => {
		const controls = createDeferred<{ stop: () => void }>()
		const zxingControls = { stop: vi.fn() }
		const { track, stream } = createStream()
		const stop = startCameraScan(
			createEnvironment({ openCamera: async () => stream, loadZxingReader: async () => ({ decode: () => controls.promise }) }),
			createCallbacks()
		)
		await flushPromises()

		stop()
		expect(track.stop).toHaveBeenCalledTimes(1)
		controls.resolve(zxingControls)
		await flushPromises()

		expect(zxingControls.stop).toHaveBeenCalledTimes(1)
	})

	test("fechar depois de ler tudo para a câmera e o zxing uma vez só", async () => {
		const zxingControls = { stop: vi.fn() }
		const { track, stream } = createStream()
		const callbacks = createCallbacks()
		const stop = startCameraScan(
			createEnvironment({ openCamera: async () => stream, loadZxingReader: async () => ({ decode: async () => zxingControls }) }),
			callbacks
		)
		await flushPromises()
		expect(callbacks.onScanning).toHaveBeenCalledTimes(1)

		stop()
		expect(track.stop).toHaveBeenCalledTimes(1)
		expect(zxingControls.stop).toHaveBeenCalledTimes(1)
	})

	test("permissão negada avisa na tela; fechada antes, não avisa", async () => {
		const open = createCallbacks()
		startCameraScan(createEnvironment({ openCamera: () => Promise.reject(new Error("NotAllowedError")) }), open)
		await flushPromises()
		expect(open.onError).toHaveBeenCalledWith(CAMERA_UNAVAILABLE_MESSAGE)

		const camera = createDeferred<never>()
		const closed = createCallbacks()
		const stop = startCameraScan(createEnvironment({ openCamera: () => camera.promise }), closed)
		stop()
		camera.reject(new Error("NotAllowedError"))
		await flushPromises()
		expect(closed.onError).not.toHaveBeenCalled()
	})

	test("zxing que não carrega avisa que o navegador não lê pela câmera", async () => {
		const callbacks = createCallbacks()
		startCameraScan(createEnvironment({ loadZxingReader: () => Promise.reject(new Error("chunk")) }), callbacks)
		await flushPromises()
		expect(callbacks.onError).toHaveBeenCalledWith(CAMERA_UNSUPPORTED_MESSAGE)
	})

	test("detector nativo entrega a primeira leitura e não pede outro quadro", async () => {
		const detector: NativeDetectorLike = { detect: async () => [{ rawValue: "7891234567895" }] }
		const requestFrame = vi.fn(() => 1)
		const callbacks = createCallbacks()
		startCameraScan(createEnvironment({ createNativeDetector: () => detector, requestFrame }), callbacks)
		await flushPromises()

		expect(callbacks.onScan).toHaveBeenCalledWith("7891234567895")
		expect(requestFrame).not.toHaveBeenCalled()
	})

	test("fechar no meio da detecção não entrega leitura nem agenda quadro", async () => {
		const detection = createDeferred<Array<{ rawValue: string }>>()
		const requestFrame = vi.fn(() => 1)
		const callbacks = createCallbacks()
		const stop = startCameraScan(createEnvironment({ createNativeDetector: () => ({ detect: () => detection.promise }), requestFrame }), callbacks)
		await flushPromises()

		stop()
		detection.resolve([{ rawValue: "7891234567895" }])
		await flushPromises()

		expect(callbacks.onScan).not.toHaveBeenCalled()
		expect(requestFrame).not.toHaveBeenCalled()
	})
})
