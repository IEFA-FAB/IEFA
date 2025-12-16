import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/journal/review/$assignmentId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/journal/review/$assignmentId"!</div>
}
