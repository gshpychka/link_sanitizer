{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs-18_x
    pkgs.nodePackages.aws-cdk
    pkgs.nodePackages.pnpm
  ];
}
