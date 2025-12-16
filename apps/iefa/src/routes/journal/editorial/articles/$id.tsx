import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/journal/editorial/articles/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/journal/editorial/articles/$id"!</div>
}
