import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/journal/editorial/settings')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/journal/editorial/settings"!</div>
}
