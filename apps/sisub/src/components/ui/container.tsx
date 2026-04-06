import { cn } from "@/lib/utils"

type ContainerProps = React.ComponentProps<"div">

function Container({ className, ...props }: ContainerProps) {
	return <div className={cn("w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]", className)} {...props} />
}

export { Container }
