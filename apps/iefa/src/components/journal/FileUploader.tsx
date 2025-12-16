import { Button } from "@iefa/ui";
import { FileText, Upload, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";

interface FileUploaderProps {
	accept?: Record<string, string[]>;
	maxSize?: number; // in bytes
	maxFiles?: number;
	label: string;
	description?: string;
	required?: boolean;
	value?: File | File[];
	onChange: (files: File | File[] | undefined) => void;
	error?: string;
	multiple?: boolean;
}

export function FileUploader({
	accept = { "application/pdf": [".pdf"] },
	maxSize = 10 * 1024 * 1024, // 10MB default
	maxFiles = 1,
	label,
	description,
	required = false,
	value,
	onChange,
	error,
	multiple = false,
}: FileUploaderProps) {
	const [uploadError, setUploadError] = useState<string | null>(null);

	const onDrop = useCallback(
		(acceptedFiles: File[], rejectedFiles: any[]) => {
			setUploadError(null);

			if (rejectedFiles.length > 0) {
				const rejection = rejectedFiles[0];
				if (rejection.errors[0]?.code === "file-too-large") {
					setUploadError(
						`Arquivo muito grande. Tamanho máximo: ${(maxSize / 1024 / 1024).toFixed(0)}MB`,
					);
				} else if (rejection.errors[0]?.code === "file-invalid-type") {
					setUploadError("Tipo de arquivo não aceito");
				} else {
					setUploadError(
						rejection.errors[0]?.message || "Erro ao fazer upload",
					);
				}
				return;
			}

			if (acceptedFiles.length > 0) {
				if (multiple) {
					// For multiple files, append to existing
					const existing = Array.isArray(value) ? value : [];
					const newFiles = [...existing, ...acceptedFiles].slice(0, maxFiles);
					onChange(newFiles);
				} else {
					// For single file, replace
					onChange(acceptedFiles[0]);
				}
			}
		},
		[maxSize, multiple, value, onChange, maxFiles],
	);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		accept,
		maxSize,
		maxFiles: multiple ? maxFiles : 1,
		multiple,
	});

	const removeFile = (index?: number) => {
		if (multiple && Array.isArray(value)) {
			const newFiles = value.filter((_, i) => i !== index);
			onChange(newFiles.length > 0 ? newFiles : undefined);
		} else {
			onChange(undefined);
		}
	};

	const files = multiple && Array.isArray(value) ? value : value ? [value] : [];
	const hasFiles = files.length > 0;

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<label className="text-sm font-medium">
					{label}
					{required && <span className="text-destructive ml-1">*</span>}
				</label>
			</div>

			{description && (
				<p className="text-sm text-muted-foreground">{description}</p>
			)}

			<div
				{...getRootProps()}
				className={cn(
					"border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
					isDragActive
						? "border-primary bg-primary/5"
						: "border-border hover:border-primary/50",
					error || uploadError ? "border-destructive" : "",
				)}
			>
				<input {...getInputProps()} />
				<div className="flex flex-col items-center gap-2">
					<Upload className="size-8 text-muted-foreground" />
					<div className="text-sm">
						{isDragActive ? (
							<p className="text-primary font-medium">
								Solte o arquivo aqui...
							</p>
						) : (
							<>
								<p className="font-medium">
									Clique para selecionar ou arraste o arquivo
								</p>
								<p className="text-muted-foreground mt-1">
									{Object.keys(accept)
										.map((mime) => accept[mime].join(", "))
										.join(", ")}{" "}
									(máx. {(maxSize / 1024 / 1024).toFixed(0)}MB)
								</p>
							</>
						)}
					</div>
				</div>
			</div>

			{(error || uploadError) && (
				<p className="text-sm text-destructive">{error || uploadError}</p>
			)}

			{hasFiles && (
				<div className="space-y-2">
					<p className="text-sm font-medium">
						Arquivo{files.length > 1 ? "s" : ""} selecionado
						{files.length > 1 ? "s" : ""}:
					</p>
					{files.map((file, index) => (
						<div
							key={`${file.name}-${index}`}
							className="flex items-center gap-2 p-3 border rounded-lg bg-card"
						>
							<FileText className="size-4 text-muted-foreground shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">{file.name}</p>
								<p className="text-xs text-muted-foreground">
									{(file.size / 1024 / 1024).toFixed(2)} MB
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={(e) => {
									e.stopPropagation();
									removeFile(multiple ? index : undefined);
								}}
							>
								<X className="size-4" />
							</Button>
						</div>
					))}
				</div>
			)}

			{multiple && hasFiles && files.length < maxFiles && (
				<p className="text-xs text-muted-foreground">
					Você pode adicionar mais {maxFiles - files.length} arquivo
					{maxFiles - files.length > 1 ? "s" : ""}
				</p>
			)}
		</div>
	);
}
