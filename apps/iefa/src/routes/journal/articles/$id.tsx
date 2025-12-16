import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/journal/articles/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/journal/articles/$id"!</div>
}
