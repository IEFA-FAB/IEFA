import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/journal/editorial/publication')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/journal/editorial/publication"!</div>
}
