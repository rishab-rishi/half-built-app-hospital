import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Every size keeps a 44px minimum touch target. Hover changes are subtle and short.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-[0.9375rem] font-medium whitespace-nowrap no-underline transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[#1a2820]",
        outline: "border-input bg-paper text-foreground hover:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-[#dbe1cf]",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        destructive: "bg-rust-soft text-rust hover:bg-[#ecd4c5]",
        link: "text-foreground underline underline-offset-4 hover:text-rust",
      },
      size: {
        default: "min-h-11 px-5",
        sm: "min-h-11 px-4",
        lg: "min-h-12 px-6 text-base",
        xs: "min-h-11 px-3",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
