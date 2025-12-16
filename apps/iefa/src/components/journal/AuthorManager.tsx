import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Input, Label } from "@iefa/ui";
import { GripVertical, X } from "lucide-react";
import { useMemo } from "react";
import type { AuthorFormData } from "@/lib/journal/validation";

interface AuthorManagerProps {
	authors: AuthorFormData[];
	onChange: (authors: AuthorFormData[]) => void;
	onAddAuthor: () => void;
	error?: string;
}

export function AuthorManager({
	authors,
	onChange,
	onAddAuthor,
	error,
}: AuthorManagerProps) {
	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const authorIds = useMemo(
		() => authors.map((_, index) => `author-${index}`),
		[authors],
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			const oldIndex = authorIds.indexOf(active.id as string);
			const newIndex = authorIds.indexOf(over.id as string);
			onChange(arrayMove(authors, oldIndex, newIndex));
		}
	};

	const updateAuthor = (
		index: number,
		field: keyof AuthorFormData,
		value: any,
	) => {
		const updated = [...authors];
		updated[index] = { ...updated[index], [field]: value };

		// If setting corresponding, unset all others
		if (field === "is_corresponding" && value === true) {
			updated.forEach((author, i) => {
				if (i !== index) {
					author.is_corresponding = false;
				}
			});
		}

		onChange(updated);
	};

	const removeAuthor = (index: number) => {
		onChange(authors.filter((_, i) => i !== index));
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="font-medium">Autores</h3>
					<p className="text-sm text-muted-foreground">
						Arraste para reordenar. A ordem será mantida na publicação.
					</p>
				</div>
				<Button type="button" onClick={onAddAuthor}>
					Adicionar Autor
				</Button>
			</div>

			{error && <p className="text-sm text-destructive">{error}</p>}

			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={authorIds}
					strategy={verticalListSortingStrategy}
				>
					<div className="space-y-3">
						{authors.map((author, index) => (
							<SortableAuthorItem
								key={authorIds[index]}
								id={authorIds[index]}
								author={author}
								index={index}
								onUpdate={updateAuthor}
								onRemove={removeAuthor}
								canRemove={authors.length > 1}
							/>
						))}
					</div>
				</SortableContext>
			</DndContext>

			{authors.length === 0 && (
				<div className="text-center py-8 border-2 border-dashed rounded-lg">
					<p className="text-sm text-muted-foreground">
						Nenhum autor adicionado. Clique em "Adicionar Autor" para começar.
					</p>
				</div>
			)}
		</div>
	);
}

interface SortableAuthorItemProps {
	id: string;
	author: AuthorFormData;
	index: number;
	onUpdate: (index: number, field: keyof AuthorFormData, value: any) => void;
	onRemove: (index: number) => void;
	canRemove: boolean;
}

function SortableAuthorItem({
	id,
	author,
	index,
	onUpdate,
	onRemove,
	canRemove,
}: SortableAuthorItemProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className="p-4 border rounded-lg bg-card space-y-3"
		>
			<div className="flex items-center gap-3">
				<button
					type="button"
					{...attributes}
					{...listeners}
					className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded"
				>
					<GripVertical className="size-5 text-muted-foreground" />
				</button>

				<div className="flex-1">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium">Autor {index + 1}</span>
						{author.is_corresponding && (
							<span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
								Correspondente
							</span>
						)}
					</div>
				</div>

				{canRemove && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onRemove(index)}
					>
						<X className="size-4" />
					</Button>
				)}
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				<div className="space-y-1">
					<Label htmlFor={`author-${index}-name`}>
						Nome Completo <span className="text-destructive">*</span>
					</Label>
					<Input
						id={`author-${index}-name`}
						value={author.full_name}
						onChange={(e) => onUpdate(index, "full_name", e.target.value)}
						placeholder="Nome completo do autor"
					/>
				</div>

				<div className="space-y-1">
					<Label htmlFor={`author-${index}-email`}>E-mail</Label>
					<Input
						id={`author-${index}-email`}
						type="email"
						value={author.email || ""}
						onChange={(e) => onUpdate(index, "email", e.target.value)}
						placeholder="email@exemplo.com"
					/>
				</div>

				<div className="space-y-1">
					<Label htmlFor={`author-${index}-affiliation`}>Afiliação</Label>
					<Input
						id={`author-${index}-affiliation`}
						value={author.affiliation || ""}
						onChange={(e) => onUpdate(index, "affiliation", e.target.value)}
						placeholder="Universidade ou instituição"
					/>
				</div>

				<div className="space-y-1">
					<Label htmlFor={`author-${index}-orcid`}>ORCID iD</Label>
					<Input
						id={`author-${index}-orcid`}
						value={author.orcid || ""}
						onChange={(e) => onUpdate(index, "orcid", e.target.value)}
						placeholder="0000-0000-0000-0000"
					/>
				</div>
			</div>

			<div className="flex items-center space-x-2">
				<input
					id={`author-${index}-corresponding`}
					type="checkbox"
					checked={author.is_corresponding}
					onChange={(e) =>
						onUpdate(index, "is_corresponding", e.target.checked)
					}
					className="size-4 rounded border-gray-300"
				/>
				<Label
					htmlFor={`author-${index}-corresponding`}
					className="cursor-pointer"
				>
					Autor correspondente
				</Label>
			</div>
		</div>
	);
}
