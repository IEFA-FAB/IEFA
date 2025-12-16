import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/journal/editorial/dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/journal/editorial/dashboard"!</div>
}
