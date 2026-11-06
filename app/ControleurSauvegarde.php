<?php
declare(strict_types=1);

/** Sauvegarde et restauration de la base (administrateurs uniquement), voir Sauvegarde. */
final class ControleurSauvegarde
{
    /** Mot à envoyer avec la restauration : confirmation explicite que tout sera remplacé. */
    private const CONFIRMATION = 'REMPLACER';

    /** GET /api/sauvegarde : versions du schéma (base et application). */
    public static function etat(): never
    {
        Droits::exigerAdmin(Auth::exigerConnexion());
        Reponse::json([
            'version_base' => Sauvegarde::versionBase(),
            'version_application' => Sauvegarde::versionApplication(),
        ]);
    }

    /** GET /api/sauvegarde/telechargement : fichier signage_sauvegarde_AAAA-MM-JJ_HHMM.json. */
    public static function telecharger(): never
    {
        Droits::exigerAdmin(Auth::exigerConnexion());
        try {
            Sauvegarde::exigerBaseAJour();
        } catch (RuntimeException $e) {
            Reponse::erreur($e->getMessage(), 409);
        }
        $json = Sauvegarde::json(Sauvegarde::exporter());
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . Sauvegarde::nomFichier() . '"');
        header('Content-Length: ' . strlen($json));
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo $json;
        exit;
    }

    /**
     * POST /api/sauvegarde/restauration (multipart : fichier, confirmation = « REMPLACER ») :
     * sauvegarde automatique de l'état actuel, puis remplacement de toutes les données.
     */
    public static function restaurer(): never
    {
        Droits::exigerAdmin(Auth::exigerConnexion());
        if (($_POST['confirmation'] ?? '') !== self::CONFIRMATION) {
            Reponse::erreur('Confirmation manquante : la restauration remplace toutes les données actuelles.', 400);
        }
        $f = $_FILES['fichier'] ?? null;
        if (!is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $f['tmp_name'])) {
            $trop = in_array($f['error'] ?? null, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
            Reponse::erreur($trop ? 'Fichier trop volumineux pour la configuration de PHP (upload_max_filesize).' : 'Aucun fichier reçu.', 400);
        }
        if ((int) $f['size'] > (int) Config::get('envoi_max_octets')) {
            Reponse::erreur('Fichier trop volumineux (taille maximale des envois de config.php).', 400);
        }
        try {
            $document = json_decode((string) file_get_contents((string) $f['tmp_name']), true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            Reponse::erreur('Ce fichier n\'est pas une sauvegarde de Signage Studio (JSON illisible).', 400);
        }

        try {
            Sauvegarde::exigerBaseAJour();
            $versionSauvegarde = is_array($document) ? ($document['version_schema'] ?? null) : null;
            $document = Sauvegarde::convertir($document);
            Sauvegarde::verifier($document);
            $automatique = Sauvegarde::enregistrerSurDisque(Sauvegarde::exporter(), 'avant_restauration');
            Sauvegarde::restaurer($document);
        } catch (RuntimeException $e) {
            Reponse::erreur($e->getMessage(), 400);
        }
        Reponse::json([
            'ok' => true,
            'sauvegarde_automatique' => $automatique,
            'version_sauvegarde' => $versionSauvegarde,
            'medias' => Sauvegarde::controleMedias(),
        ]);
    }
}
