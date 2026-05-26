// @supabase/phoenix@0.4.0 bug: Socket.teardown() captures this.conn as connToClose
// and then, inside a waitForBufferDone callback, calls connToClose.close(). In CI,
// when a WebSocket connection fails before reaching OPEN state (e.g. a timed-out
// subscription probe), this.conn can be an object whose .close property is not a
// function. The teardown code has no guard against this.
//
// Fix: before entering teardown, if conn exists but conn.close is not a function,
// null conn out so teardown takes its early-return path cleanly.
// @ts-expect-error — @supabase/phoenix is a transitive dep without a direct package.json entry
import { Socket } from "@supabase/phoenix"

const origTeardown = Socket.prototype.teardown as (callback: (() => void) | undefined, code?: number, reason?: string) => void

Socket.prototype.teardown = function (this: { conn: unknown }, callback: (() => void) | undefined, code?: number, reason?: string) {
	if (this.conn !== null && this.conn !== undefined && typeof (this.conn as { close?: unknown }).close !== "function") {
		this.conn = null
	}
	origTeardown.call(this, callback, code, reason)
}
