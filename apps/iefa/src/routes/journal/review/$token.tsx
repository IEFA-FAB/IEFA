import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/journal/review/$token')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/journal/review/$token"!</div>
}
