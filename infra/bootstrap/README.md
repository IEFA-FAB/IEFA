# Terraform backend bootstrap

Cria os recursos que guardam o estado remoto:

- S3 versionado e criptografado para `terraform.tfstate`.
- DynamoDB `PAY_PER_REQUEST` com chave `LockID` para lock legado.
- `use_lockfile = true` tambem deve ser usado no backend S3 atual.

Uso:

```bash
terraform init
terraform apply
terraform output backend_config
```

Depois copie os valores para `../sisub/backend.tf` a partir de `../sisub/backend.tf.example`.
